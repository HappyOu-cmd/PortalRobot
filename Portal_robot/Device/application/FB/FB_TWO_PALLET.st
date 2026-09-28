FUNCTION_BLOCK FB_TWO_PALLET
VAR_INPUT
	xSelected : BOOL;
	xManual : BOOL;
	xSafe : BOOL;
	xRobotClear : BOOL; // Окно планировщика и освобождение зоны для обмена в автоматическом режиме
	xRobotIdle : BOOL; // Останов робота без проверки точек, интерфейса и зоны магазина
	xRobotOperation : BOOL; // Текущая или уже выданная операция с этим магазином
	xRobotGeometryReady : BOOL; // Точки робота нужны для работы ячейки, но не для включения магазина
	xRobotMagazineReady : BOOL; // Ошибки и геометрия магазина; содержимое не блокирует включение
	xConnection : BOOL;
	xStopRequest : BOOL;
	xAutoSwap : BOOL;
	xOtherLoaded : BOOL;
	xActivePalletEditAllowed : BOOL;
	xConfigurationChanged : BOOL;
	xExternalCommandRejected : BOOL;
	Command : ST_TWO_PALLET_COMMAND;
	Config : ST_TWO_PALLET_CONFIG;
	Input : ST_TWO_PALLET_INPUT;
END_VAR
VAR_OUTPUT
	Status : ST_TWO_PALLET_STATUS;
	Diag : ST_TWO_PALLET_DIAG;
	Error : ST_TWO_PALLET_ERRORS;
	Output : ST_TWO_PALLET_OUTPUT;
END_VAR
VAR
	ePreviousState : E_TWO_PALLET_STATE := E_TWO_PALLET_STATE.IDLE;
	uiFrom : UINT;
	uiTo : UINT;
	uiSelected : UINT;
	uiCandidate : UINT;
	uiPreviousCandidate : UINT;
	uiConfirmedCandidate : UINT;
	uiManualSelected : UINT;
	uiJogDirection : UINT;
	uiSignals : UINT;
	uiSelectedSignals : UINT;
	uiTargetSignals : UINT;
	xPreviousBaseValid : BOOL;
	xConfigValid : BOOL;
	xContradiction : BOOL;
	xPairValid : BOOL;
	xWork : BOOL;
	xExchange : BOOL;
	xIdle : BOOL;
	xBase : BOOL;
	xRecovery : BOOL;
	xPneumaticBase : BOOL;
	xPneumaticRecovery : BOOL;
	xManualPneumaticState : BOOL;
	xAutomaticState : BOOL;
	xAxisMotionState : BOOL;
	xManualState : BOOL;
	xAutoSwapAllowed : BOOL;
	xExchangeStartedManual : BOOL; // Обмен начат в ручном режиме: без проверки роботной зоны/точек
	xCommandPresent : BOOL;
	xAccepted : BOOL;
	xStateEntry : BOOL;
	xSeenMotion : BOOL;
	xSeenDone : BOOL;
	xLiftUpCommand : BOOL;
	xLiftDownCommand : BOOL;
	xSelectCommand : BOOL;
	xManualLockCommand : BOOL;
	xManualStopCommand : BOOL;
	xManualLockOutTarget : BOOL;
	xManualStopOutTarget : BOOL;
	xLockOutTarget : BOOL;
	xStopOutTarget : BOOL;
	xStartupInitialized : BOOL;
	xTrustedAtScanStart : BOOL;
	lrWork : LREAL;
	lrTarget : LREAL;
	lrSpan : LREAL;
	rTravel : REAL;
	tStateLimit : TIME;
	tonState : TON;
	tonCoil : TON;
	tonJogLease : TON;
	dwPreviousError : DWORD;
END_VAR
VAR CONSTANT
	ERR_DRIVE : DWORD := DWORD#16#100;
	ERR_SENSOR_CONTRADICTION : DWORD := DWORD#16#200;
	ERR_CYLINDER_TIMEOUT : DWORD := DWORD#16#400;
	ERR_MOTION_TIMEOUT : DWORD := DWORD#16#800;
	ERR_LOGIC : DWORD := DWORD#16#1000;
	ERR_SEQUENCE_INTERRUPTED : DWORD := DWORD#16#2000;
	WRN_COMMAND_REJECTED : UINT := UINT#30;
	WRN_START_REJECTED_BY_OPERATOR : UINT := UINT#31;
	JOG_POSITIVE : UINT := UINT#1;
	JOG_NEGATIVE : UINT := UINT#2;
END_VAR

// --- BEGIN IMPLEMENTATION ---

// Шаги, разрешения и подтверждение положения не восстанавливаются после старта PLC.
IF NOT xStartupInitialized THEN
	Diag.eState := E_TWO_PALLET_STATE.IDLE;
	ePreviousState := E_TWO_PALLET_STATE.IDLE;
	Status.xConfirmed := FALSE;
	Status.xEnabled := FALSE;
	xStartupInitialized := TRUE;
END_IF;

Status.xCompleted := FALSE;
Status.Input := Input;
xTrustedAtScanStart := Status.xConfirmed;

// Все выходные команды импульсные или формируются заново на каждом скане.
Output.xPowerOn := FALSE;
Output.xPowerOff := FALSE;
Output.xDriveReset := FALSE;
Output.xHome := FALSE;
Output.xMove := FALSE;
Output.xStop := FALSE;
Output.xJogPositive := FALSE;
Output.xJogNegative := FALSE;
Output.xTeachOperator := FALSE;
Output.xTeachWork := FALSE;
xLiftUpCommand := FALSE;
xLiftDownCommand := FALSE;
xSelectCommand := FALSE;
xManualLockCommand := FALSE;
xManualStopCommand := FALSE;

// Конфигурация механизма.
xConfigValid := Config.xConfigured
	AND Config.xSignalPatternsConfigured
	AND IsSignalConfigurationValid(uiP1Signals := Config.uiP1Signals, uiP2Signals := Config.uiP2Signals)
	AND (Config.lrTolerance > 0.0)
	AND (Config.lrTolerance <= 20.0)
	AND (ABS(Config.lrWorkP1 - Config.lrExchange) > 2.0 * Config.lrTolerance)
	AND (ABS(Config.lrWorkP2 - Config.lrExchange) > 2.0 * Config.lrTolerance)
	AND ((Config.lrWorkP1 - Config.lrExchange) * (Config.lrWorkP2 - Config.lrExchange) > 0.0)
	AND (Config.lrVelocity > 0.0)
	AND (Config.lrAcceleration > 0.0)
	AND (Config.lrDeceleration > 0.0)
	AND (Config.lrJerk > 0.0)
	AND (Config.tPulse >= T#50MS)
	AND (Config.tCylinder > Config.tPulse)
	AND (Config.tMove > T#0S)
	AND (Config.tHome > T#0S);
Status.xConfigValid := xConfigValid;

// Фактическое состояние пневматики и каретки.
xContradiction := (Input.xLiftUp AND Input.xLiftDown)
	OR (Input.xLockIn AND Input.xLockOut)
	OR (Input.xStopIn AND Input.xStopOut)
	OR (Input.xLimitNegative AND Input.xLimitPositive);
xPairValid := (Input.xLockIn XOR Input.xLockOut)
	AND (Input.xStopIn XOR Input.xStopOut);

uiSignals := UINT#0;
IF Input.xLiftDown THEN uiSignals := uiSignals OR UINT#1; END_IF;
IF Input.xLiftUp THEN uiSignals := uiSignals OR UINT#2; END_IF;
IF Input.xLockIn THEN uiSignals := uiSignals OR UINT#4; END_IF;
IF Input.xLockOut THEN uiSignals := uiSignals OR UINT#8; END_IF;
IF Input.xStopIn THEN uiSignals := uiSignals OR UINT#16; END_IF;
IF Input.xStopOut THEN uiSignals := uiSignals OR UINT#32; END_IF;

uiSelected := UINT#0;
IF xPairValid THEN
	IF (uiSignals AND UINT#60) = (Config.uiP1Signals AND UINT#60) THEN
		uiSelected := UINT#1;
	ELSIF (uiSignals AND UINT#60) = (Config.uiP2Signals AND UINT#60) THEN
		uiSelected := UINT#2;
	END_IF;
END_IF;
xPairValid := xPairValid AND (uiSelected <> UINT#0);

lrWork := Config.lrWorkP1;
uiSelectedSignals := Config.uiP1Signals;
IF uiSelected = UINT#2 THEN
	lrWork := Config.lrWorkP2;
	uiSelectedSignals := Config.uiP2Signals;
END_IF;

xWork := xConfigValid
	AND Input.xHomed
	AND Input.xStandstill
	AND xPairValid
	AND (ABS(Input.lrPosition - lrWork) <= Config.lrTolerance);
xExchange := xConfigValid
	AND Input.xHomed
	AND Input.xStandstill
	AND (ABS(Input.lrPosition - Config.lrExchange) <= Config.lrTolerance);

uiCandidate := UINT#0;
IF xWork
	AND (uiSignals = uiSelectedSignals)
	AND NOT xContradiction
	AND NOT Input.xDriveError
	AND NOT Status.xHomeRequired THEN
	uiCandidate := uiSelected;
END_IF;

xIdle := Diag.eState = E_TWO_PALLET_STATE.IDLE;
xAutomaticState := (Diag.eState = E_TWO_PALLET_STATE.AUTO_LOWER)
	OR (Diag.eState = E_TWO_PALLET_STATE.AUTO_MOVE_TO_EXCHANGE)
	OR (Diag.eState = E_TWO_PALLET_STATE.AUTO_SELECT_PALLET)
	OR (Diag.eState = E_TWO_PALLET_STATE.AUTO_MOVE_TO_WORK)
	OR (Diag.eState = E_TWO_PALLET_STATE.AUTO_RAISE);
xAxisMotionState := (Diag.eState = E_TWO_PALLET_STATE.AUTO_MOVE_TO_EXCHANGE)
	OR (Diag.eState = E_TWO_PALLET_STATE.AUTO_MOVE_TO_WORK)
	OR (Diag.eState = E_TWO_PALLET_STATE.MANUAL_MOVE)
	OR (Diag.eState = E_TWO_PALLET_STATE.MANUAL_HOME)
	OR (Diag.eState = E_TWO_PALLET_STATE.MANUAL_JOG);
xManualState := (Diag.eState = E_TWO_PALLET_STATE.MANUAL_LOWER)
	OR (Diag.eState = E_TWO_PALLET_STATE.MANUAL_RAISE)
	OR (Diag.eState = E_TWO_PALLET_STATE.MANUAL_SELECT_PALLET)
	OR (Diag.eState = E_TWO_PALLET_STATE.MANUAL_MOVE)
	OR (Diag.eState = E_TWO_PALLET_STATE.MANUAL_HOME)
	OR (Diag.eState = E_TWO_PALLET_STATE.MANUAL_JOG)
	OR (Diag.eState = E_TWO_PALLET_STATE.MANUAL_LOCK)
	OR (Diag.eState = E_TWO_PALLET_STATE.MANUAL_STOP);
xManualPneumaticState := (Diag.eState = E_TWO_PALLET_STATE.MANUAL_LOWER)
	OR (Diag.eState = E_TWO_PALLET_STATE.MANUAL_LOCK)
	OR (Diag.eState = E_TWO_PALLET_STATE.MANUAL_STOP);

xBase := xSelected
	AND xConfigValid
	AND Input.xIoMapped
	AND Input.xAxisBound
	AND xSafe
	AND NOT xRobotOperation;
xRecovery := xBase
	AND xManual
	AND xConnection
	AND xIdle
	AND Input.xStandstill;
xPneumaticBase := xSelected
	AND xManual
	AND xSafe
	AND NOT xRobotOperation
	AND Input.xIoMapped
	AND Input.xStandstill;
xPneumaticRecovery := xPneumaticBase AND xIdle;

Status.uiCandidate := uiCandidate;
Status.uiSelected := uiSelected;

// Любое изменение достоверной расстановки аннулирует старое подтверждение.
IF (uiCandidate <> uiPreviousCandidate) OR (xBase <> xPreviousBaseValid) THEN
	Status.udiRevision := Status.udiRevision + UDINT#1;
	IF Status.udiRevision = UDINT#0 THEN
		Status.udiRevision := UDINT#1;
	END_IF;
END_IF;
uiPreviousCandidate := uiCandidate;
xPreviousBaseValid := xBase;

IF xConfigurationChanged THEN
	Status.xConfirmed := FALSE;
	Status.xEnabled := FALSE;
	Status.udiRevision := Status.udiRevision + UDINT#1;
	IF Status.udiRevision = UDINT#0 THEN
		Status.udiRevision := UDINT#1;
	END_IF;
END_IF;

IF NOT xSelected
	OR NOT xSafe
	OR NOT Input.xAxisBound
	OR NOT Input.xIoMapped
	OR NOT xConfigValid
	OR Input.xDriveError
	OR NOT Input.xPowered
	OR (xIdle AND (uiCandidate <> uiConfirmedCandidate)) THEN
	Status.xConfirmed := FALSE;
END_IF;
// Пропадание heartbeat выключает автоматическую обработку, но само по себе
// не перемещает механику и не стирает уже проверенную идентичность палет.
IF NOT xConnection THEN Status.xEnabled := FALSE; END_IF;

// Первая невыполненная предпосылка для HMI.
Diag.uiReason := UINT#0;
IF NOT xSelected THEN
	Diag.uiReason := UINT#1;
ELSIF NOT xConfigValid THEN
	Diag.uiReason := UINT#2;
ELSIF NOT Input.xAxisBound OR NOT Input.xIoMapped THEN
	Diag.uiReason := UINT#3;
ELSIF NOT xSafe THEN
	Diag.uiReason := UINT#4;
ELSIF NOT xConnection THEN
	Diag.uiReason := UINT#17;
ELSIF Input.xDriveError THEN
	Diag.uiReason := UINT#6;
ELSIF Error.dwErrorActive <> DWORD#0 THEN
	Diag.uiReason := UINT#19;
ELSIF NOT Input.xPowered THEN
	Diag.uiReason := UINT#18;
ELSIF xContradiction THEN
	Diag.uiReason := UINT#7;
ELSIF Status.xHomeRequired OR NOT Input.xHomed THEN
	Diag.uiReason := UINT#8;
ELSIF NOT xPairValid THEN
	Diag.uiReason := UINT#9;
ELSIF NOT Input.xStandstill THEN
	Diag.uiReason := UINT#10;
ELSIF NOT xWork THEN
	Diag.uiReason := UINT#11;
ELSIF uiSignals <> uiSelectedSignals THEN
	Diag.uiReason := UINT#12;
ELSIF NOT xIdle THEN
	Diag.uiReason := UINT#22;
ELSIF NOT xRobotMagazineReady THEN
	Diag.uiReason := UINT#16;
ELSIF NOT Status.xConfirmed AND NOT xManual THEN
	Diag.uiReason := UINT#20;
ELSIF NOT Status.xConfirmed THEN
	Diag.uiReason := UINT#13;
END_IF;

// Аварии механизма: биты 8..13 зарезервированы в MAGAZINE_LOGIC_1/2.
IF xSelected AND Input.xDriveError THEN
	Error.dwErrorActive := Error.dwErrorActive OR ERR_DRIVE;
	Status.xHomeRequired := TRUE;
END_IF;

IF xSelected AND xContradiction THEN
	Error.dwErrorActive := Error.dwErrorActive OR ERR_SENSOR_CONTRADICTION;
END_IF;

IF xSelected
	AND NOT xIdle
	AND (((NOT xBase) AND NOT (xManualPneumaticState AND xPneumaticBase))
		OR ((NOT xConnection) AND NOT xManualPneumaticState) OR xStopRequest
		OR (xAutomaticState AND ((xExchangeStartedManual AND (NOT xManual OR NOT xRobotIdle))
			OR (NOT xExchangeStartedManual AND NOT xRobotClear)))) THEN
	Error.dwErrorActive := Error.dwErrorActive OR ERR_SEQUENCE_INTERRUPTED;
	Diag.eState := E_TWO_PALLET_STATE.IDLE;
	Output.xStop := TRUE;
END_IF;

IF xSelected AND (xTrustedAtScanStart OR xAutomaticState) THEN
	IF ((Diag.eState <> E_TWO_PALLET_STATE.AUTO_SELECT_PALLET) AND NOT xPairValid)
		OR (((Diag.eState = E_TWO_PALLET_STATE.AUTO_MOVE_TO_EXCHANGE)
			OR (Diag.eState = E_TWO_PALLET_STATE.AUTO_MOVE_TO_WORK))
			AND (NOT Input.xLiftDown OR Input.xLiftUp))
		OR (xIdle AND (uiCandidate = UINT#0)) THEN
		Error.dwErrorActive := Error.dwErrorActive OR ERR_LOGIC;
	END_IF;
END_IF;

IF xSelected
	AND xTrustedAtScanStart
	AND (NOT xSafe
		OR NOT Input.xAxisBound
		OR NOT Input.xIoMapped
		OR NOT Input.xPowered) THEN
	Error.dwErrorActive := Error.dwErrorActive OR ERR_SEQUENCE_INTERRUPTED;
END_IF;

IF xSelected
	AND ((xContradiction AND NOT xIdle AND NOT xManualPneumaticState)
		OR (Input.xDriveError AND xAxisMotionState)) THEN
	Diag.eState := E_TWO_PALLET_STATE.IDLE;
	Output.xStop := TRUE;
END_IF;

IF xSelected AND NOT Input.xPowered AND (xAutomaticState OR xAxisMotionState) THEN
	Error.dwErrorActive := Error.dwErrorActive OR ERR_SEQUENCE_INTERRUPTED;
	Status.xHomeRequired := TRUE;
	Diag.eState := E_TWO_PALLET_STATE.IDLE;
	Output.xStop := TRUE;
END_IF;

IF Error.dwErrorActive <> DWORD#0 THEN
	Status.xEnabled := FALSE;
	Status.xConfirmed := FALSE;
	IF xAutomaticState THEN
		Diag.eState := E_TWO_PALLET_STATE.IDLE;
		Output.xStop := TRUE;
	END_IF;
END_IF;

// Разрешения считаются только владельцем механизма.
Status.xConfirmAllowed := xRecovery
	AND Input.xPowered
	AND (uiCandidate <> UINT#0)
	AND (Error.dwErrorActive = DWORD#0);
Status.xStartAllowed := Status.xConfirmAllowed
	AND xRobotMagazineReady;
Status.xEnableAllowed := xBase
	AND xConnection
	AND xIdle
	AND Status.xConfirmed
	AND xRobotMagazineReady
	AND (uiCandidate = Status.uiRobotPallet)
	AND Input.xPowered
	AND (Error.dwErrorActive = DWORD#0);
// Операторский обмен выключенного магазина разрешён и в работающем автоцикле.
// В автоматическом режиме требуется окно планировщика и освобождённая зона;
// в ручном режиме остаётся останов робота без проверки его точек/зоны.
Status.xSwapAllowed := xBase
	AND xConnection
	AND xIdle
	AND Input.xStandstill
	AND Input.xPowered
	AND (Error.dwErrorActive = DWORD#0)
	AND Status.xConfirmed
	AND (uiCandidate = Status.uiRobotPallet)
	AND NOT Status.xEnabled
	AND NOT xStopRequest
	AND ((xManual AND xRobotIdle) OR (NOT xManual AND xRobotClear));
xAutoSwapAllowed := Status.xEnableAllowed
	AND xRobotClear
	AND Status.xEnabled
	AND xOtherLoaded;
Status.xPowerAllowed := xRecovery
	AND NOT Input.xDriveError
	AND NOT xContradiction;
Status.xDriveResetAllowed := xSelected
	AND xManual
	AND xConnection
	AND Input.xAxisBound
	AND Input.xStandstill
	AND xIdle;
Status.xLowerAllowed := xPneumaticRecovery;
Status.xRaiseAllowed := xRecovery
	AND NOT xContradiction
	AND NOT Status.xHomeRequired;
Status.xSelectAllowed := xRecovery
	AND NOT xContradiction
	AND Input.xLiftDown
	AND NOT Input.xLiftUp
	AND xExchange;
// Наладочные команды замка и фиксатора независимы от подъёма и координаты.
// Это позволяет вернуть герконы в согласованное состояние после остановки.
Status.xLockAllowed := xPneumaticRecovery;
Status.xStopAllowed := xPneumaticRecovery;
Status.xHomeAllowed := xRecovery
	AND Input.xPowered
	AND NOT Input.xDriveError
	AND Input.xLiftDown
	AND NOT Input.xLiftUp
	AND xPairValid
	AND NOT xContradiction;
Status.xMoveAllowed := Status.xHomeAllowed
	AND Input.xHomed
	AND NOT Status.xHomeRequired;
Status.xJogAllowed := Status.xHomeAllowed;
Status.xTeachOperatorAllowed := Status.xMoveAllowed
	AND Input.xLiftDown
	AND NOT Input.xLiftUp;
Status.xTeachWorkAllowed := Status.xTeachOperatorAllowed
	AND ((uiSelected = UINT#1) OR (uiSelected = UINT#2));
Status.xResetAllowed := xRecovery
	AND (Error.dwErrorActive <> DWORD#0)
	AND NOT xContradiction
	AND NOT Input.xDriveError
	AND NOT Status.xHomeRequired
	AND xPairValid
	AND (Input.xLiftDown XOR Input.xLiftUp);
Status.xConfigAllowed := xSelected
	AND xManual
	AND xIdle
	AND NOT Status.xEnabled
	AND (Input.xStandstill OR NOT Input.xAxisBound)
	AND NOT Input.xPowered
	AND NOT xRobotOperation;

// Командный интерфейс FB не зависит от транспортных номеров HMI 1..19.
xCommandPresent := Command.xEnable
	OR Command.xConfirm
	OR Command.xStart
	OR Command.xRejectStart
	OR Command.xDisable
	OR Command.xSwap
	OR Command.xPowerOn
	OR Command.xPowerOff
	OR Command.xDriveReset
	OR Command.xHome
	OR Command.xLower
	OR Command.xRaise
	OR Command.xSelectPallet
	OR Command.xLockIn
	OR Command.xLockOut
	OR Command.xStopIn
	OR Command.xStopOut
	OR Command.xMoveToExchange
	OR Command.xMoveToWork
	OR Command.xStop
	OR Command.xReset
	OR Command.xJogPositive
	OR Command.xJogNegative
	OR Command.xJogRelease
	OR Command.xTeachOperator
	OR Command.xTeachWork;
xAccepted := NOT xCommandPresent;

IF Command.xStart THEN
	IF Status.xStartAllowed
		AND (Command.udiRevision = Status.udiRevision)
		AND (Command.uiPallet = uiCandidate) THEN
		Status.uiRobotPallet := uiCandidate;
		uiConfirmedCandidate := uiCandidate;
		Status.xConfirmed := TRUE;
		Status.xEnabled := TRUE;
		Status.rP1 := 0.0;
		Status.rP2 := 0.0;
		IF uiCandidate = UINT#1 THEN
			Status.rP1 := 1.0;
		ELSE
			Status.rP2 := 1.0;
		END_IF;
		xAccepted := TRUE;
	END_IF;
ELSIF Command.xRejectStart THEN
	Diag.stWarning.uiCode := WRN_START_REJECTED_BY_OPERATOR;
	Diag.stWarning.udiSequence := Diag.stWarning.udiSequence + UDINT#1;
	IF Diag.stWarning.udiSequence = UDINT#0 THEN
		Diag.stWarning.udiSequence := UDINT#1;
	END_IF;
	xAccepted := TRUE;
ELSIF Command.xEnable THEN
	IF Status.xEnableAllowed THEN
		Status.xEnabled := TRUE;
		xAccepted := TRUE;
	END_IF;
ELSIF Command.xConfirm THEN
	IF Status.xConfirmAllowed
		AND (Command.udiRevision = Status.udiRevision)
		AND (Command.uiPallet = uiCandidate) THEN
		Status.uiRobotPallet := uiCandidate;
		uiConfirmedCandidate := uiCandidate;
		Status.xConfirmed := TRUE;
		Status.rP1 := 0.0;
		Status.rP2 := 0.0;
		IF uiCandidate = UINT#1 THEN
			Status.rP1 := 1.0;
		ELSE
			Status.rP2 := 1.0;
		END_IF;
		xAccepted := TRUE;
	END_IF;
ELSIF Command.xDisable THEN
	Status.xEnabled := FALSE;
	xAccepted := TRUE;
ELSIF Command.xSwap THEN
	IF Status.xSwapAllowed THEN
		xExchangeStartedManual := xManual;
		Diag.eState := E_TWO_PALLET_STATE.AUTO_LOWER;
		xAccepted := TRUE;
	END_IF;
ELSIF Command.xPowerOn THEN
	IF Status.xPowerAllowed THEN
		Output.xPowerOn := TRUE;
		xAccepted := TRUE;
	END_IF;
ELSIF Command.xPowerOff THEN
	IF Status.xDriveResetAllowed THEN
		Output.xPowerOff := TRUE;
		Status.xConfirmed := FALSE;
		Status.xEnabled := FALSE;
		xAccepted := TRUE;
	END_IF;
ELSIF Command.xDriveReset THEN
	IF Status.xDriveResetAllowed AND Input.xDriveError THEN
		Output.xDriveReset := TRUE;
		Status.xConfirmed := FALSE;
		Status.xEnabled := FALSE;
		Status.xHomeRequired := TRUE;
		xAccepted := TRUE;
	END_IF;
ELSIF Command.xHome THEN
	IF Status.xHomeAllowed THEN
		Diag.eState := E_TWO_PALLET_STATE.MANUAL_HOME;
		xAccepted := TRUE;
	END_IF;
ELSIF Command.xLower THEN
	IF Status.xLowerAllowed THEN
		Diag.eState := E_TWO_PALLET_STATE.MANUAL_LOWER;
		xAccepted := TRUE;
	END_IF;
ELSIF Command.xRaise THEN
	IF Status.xRaiseAllowed THEN
		Diag.eState := E_TWO_PALLET_STATE.MANUAL_RAISE;
		xAccepted := TRUE;
	END_IF;
ELSIF Command.xSelectPallet THEN
	IF Status.xSelectAllowed
		AND ((Command.uiPallet = UINT#1) OR (Command.uiPallet = UINT#2)) THEN
		uiTo := Command.uiPallet;
		Diag.eState := E_TWO_PALLET_STATE.MANUAL_SELECT_PALLET;
		xAccepted := TRUE;
	END_IF;
ELSIF Command.xLockIn OR Command.xLockOut THEN
	IF Status.xLockAllowed THEN
		xManualLockOutTarget := Command.xLockOut;
		Diag.eState := E_TWO_PALLET_STATE.MANUAL_LOCK;
		xAccepted := TRUE;
	END_IF;
ELSIF Command.xStopIn OR Command.xStopOut THEN
	IF Status.xStopAllowed THEN
		xManualStopOutTarget := Command.xStopOut;
		Diag.eState := E_TWO_PALLET_STATE.MANUAL_STOP;
		xAccepted := TRUE;
	END_IF;
ELSIF Command.xMoveToExchange OR Command.xMoveToWork THEN
	IF Status.xMoveAllowed THEN
		lrTarget := Config.lrExchange;
		IF Command.xMoveToWork THEN
			lrTarget := lrWork;
		END_IF;
		Diag.eState := E_TWO_PALLET_STATE.MANUAL_MOVE;
		xAccepted := TRUE;
	END_IF;
ELSIF Command.xStop THEN
	Status.xEnabled := FALSE;
	// Stop неподвижного механизма не является ручным вмешательством.
	IF (Diag.eState <> E_TWO_PALLET_STATE.IDLE) OR (Input.xPowered AND NOT Input.xStandstill) THEN
		Output.xStop := TRUE;
		Status.xConfirmed := FALSE;
		Error.dwErrorActive := Error.dwErrorActive OR ERR_SEQUENCE_INTERRUPTED;
	END_IF;
	Diag.eState := E_TWO_PALLET_STATE.IDLE;
	uiJogDirection := UINT#0;
	xAccepted := TRUE;
ELSIF Command.xReset THEN
	IF Status.xResetAllowed THEN
		Error.dwErrorLast := Error.dwErrorActive;
		Error.dwErrorActive := DWORD#0;
		Status.xConfirmed := FALSE;
		Status.xEnabled := FALSE;
		xAccepted := TRUE;
	END_IF;
ELSIF Command.xJogPositive OR Command.xJogNegative THEN
	IF Status.xJogAllowed
		OR ((Diag.eState = E_TWO_PALLET_STATE.MANUAL_JOG)
			AND xBase
			AND xManual
			AND xConnection) THEN
		Diag.eState := E_TWO_PALLET_STATE.MANUAL_JOG;
		IF Command.xJogPositive THEN
			uiJogDirection := JOG_POSITIVE;
		ELSE
			uiJogDirection := JOG_NEGATIVE;
		END_IF;
		xAccepted := TRUE;
	END_IF;
ELSIF Command.xJogRelease THEN
	uiJogDirection := UINT#0;
	IF Diag.eState = E_TWO_PALLET_STATE.MANUAL_JOG THEN
		Diag.eState := E_TWO_PALLET_STATE.IDLE;
		Output.xStop := TRUE;
	END_IF;
	xAccepted := TRUE;
ELSIF Command.xTeachOperator THEN
	IF Status.xTeachOperatorAllowed THEN
		Output.xTeachOperator := TRUE;
		xAccepted := TRUE;
	END_IF;
ELSIF Command.xTeachWork THEN
	IF Status.xTeachWorkAllowed THEN
		Output.xTeachWork := TRUE;
		xAccepted := TRUE;
	END_IF;
END_IF;

IF xCommandPresent AND NOT xAccepted THEN
	Diag.stWarning.uiCode := WRN_COMMAND_REJECTED;
	Diag.stWarning.udiSequence := Diag.stWarning.udiSequence + UDINT#1;
	IF Diag.stWarning.udiSequence = UDINT#0 THEN
		Diag.stWarning.udiSequence := UDINT#1;
	END_IF;
END_IF;

IF xExternalCommandRejected THEN
	Diag.stWarning.uiCode := WRN_COMMAND_REJECTED;
	Diag.stWarning.udiSequence := Diag.stWarning.udiSequence + UDINT#1;
	IF Diag.stWarning.udiSequence = UDINT#0 THEN
		Diag.stWarning.udiSequence := UDINT#1;
	END_IF;
END_IF;

Status.xCommandAccepted := xAccepted;

IF xAutoSwap
	AND xAutoSwapAllowed
	AND NOT Output.xStop
	AND NOT xCommandPresent THEN
	xExchangeStartedManual := FALSE;
	Diag.eState := E_TWO_PALLET_STATE.AUTO_LOWER;
END_IF;

// Стоп ячейки имеет приоритет над командой, принятой в том же скане.
// В IDLE при остановленной оси сохраняем подтверждение и не запускаем MC_Stop.
IF xStopRequest THEN
	IF (Diag.eState <> E_TWO_PALLET_STATE.IDLE) OR (Input.xPowered AND NOT Input.xStandstill) THEN
		Error.dwErrorActive := Error.dwErrorActive OR ERR_SEQUENCE_INTERRUPTED;
		Output.xStop := TRUE;
		Status.xConfirmed := FALSE;
	END_IF;
	Diag.eState := E_TWO_PALLET_STATE.IDLE;
	Status.xEnabled := FALSE;
END_IF;

// Команда могла сменить состояние в этом же скане — обновляем классификацию
// до обработки входа в шаг и запуска таймеров.
xAutomaticState := (Diag.eState = E_TWO_PALLET_STATE.AUTO_LOWER)
	OR (Diag.eState = E_TWO_PALLET_STATE.AUTO_MOVE_TO_EXCHANGE)
	OR (Diag.eState = E_TWO_PALLET_STATE.AUTO_SELECT_PALLET)
	OR (Diag.eState = E_TWO_PALLET_STATE.AUTO_MOVE_TO_WORK)
	OR (Diag.eState = E_TWO_PALLET_STATE.AUTO_RAISE);
xManualState := (Diag.eState = E_TWO_PALLET_STATE.MANUAL_LOWER)
	OR (Diag.eState = E_TWO_PALLET_STATE.MANUAL_RAISE)
	OR (Diag.eState = E_TWO_PALLET_STATE.MANUAL_SELECT_PALLET)
	OR (Diag.eState = E_TWO_PALLET_STATE.MANUAL_MOVE)
	OR (Diag.eState = E_TWO_PALLET_STATE.MANUAL_HOME)
	OR (Diag.eState = E_TWO_PALLET_STATE.MANUAL_JOG)
	OR (Diag.eState = E_TWO_PALLET_STATE.MANUAL_LOCK)
	OR (Diag.eState = E_TWO_PALLET_STATE.MANUAL_STOP);
xManualPneumaticState := (Diag.eState = E_TWO_PALLET_STATE.MANUAL_LOWER)
	OR (Diag.eState = E_TWO_PALLET_STATE.MANUAL_LOCK)
	OR (Diag.eState = E_TWO_PALLET_STATE.MANUAL_STOP);

IF (Diag.eState = E_TWO_PALLET_STATE.AUTO_LOWER)
	AND (ePreviousState <> E_TWO_PALLET_STATE.AUTO_LOWER) THEN
	uiFrom := Status.uiRobotPallet;
	uiTo := UINT#3 - uiFrom;
END_IF;

xStateEntry := Diag.eState <> ePreviousState;
IF xManualState AND xStateEntry THEN
	Status.xConfirmed := FALSE;
	Status.xEnabled := FALSE;
	Status.udiRevision := Status.udiRevision + UDINT#1;
	IF Status.udiRevision = UDINT#0 THEN
		Status.udiRevision := UDINT#1;
	END_IF;
END_IF;

IF xStateEntry THEN
	xSeenMotion := FALSE;
	xSeenDone := FALSE;
	IF (Diag.eState = E_TWO_PALLET_STATE.MANUAL_MOVE)
		OR (Diag.eState = E_TWO_PALLET_STATE.MANUAL_HOME)
		OR (Diag.eState = E_TWO_PALLET_STATE.MANUAL_JOG) THEN
		uiManualSelected := uiSelected;
	END_IF;
ELSIF Input.xMotionDone THEN
	xSeenDone := TRUE;
END_IF;

IF NOT Input.xStandstill THEN
	xSeenMotion := TRUE;
END_IF;

tStateLimit := Config.tCylinder;
IF (Diag.eState = E_TWO_PALLET_STATE.AUTO_MOVE_TO_EXCHANGE)
	OR (Diag.eState = E_TWO_PALLET_STATE.AUTO_MOVE_TO_WORK)
	OR (Diag.eState = E_TWO_PALLET_STATE.MANUAL_MOVE) THEN
	tStateLimit := Config.tMove;
END_IF;
IF Diag.eState = E_TWO_PALLET_STATE.MANUAL_HOME THEN
	tStateLimit := Config.tHome;
END_IF;

tonState(
	IN := NOT xIdle
		AND (Diag.eState <> E_TWO_PALLET_STATE.MANUAL_JOG)
		AND NOT xStateEntry,
	PT := tStateLimit);
tonCoil(
	IN := NOT xIdle AND NOT xStateEntry,
	PT := Config.tPulse);
tonJogLease(
	IN := (Diag.eState = E_TWO_PALLET_STATE.MANUAL_JOG)
		AND NOT (Command.xJogPositive OR Command.xJogNegative),
	PT := T#350MS);
ePreviousState := Diag.eState;

// Автомат обмена и ручного восстановления.
uiTargetSignals := Config.uiP1Signals;
IF uiTo = UINT#2 THEN uiTargetSignals := Config.uiP2Signals; END_IF;
CASE Diag.eState OF
	E_TWO_PALLET_STATE.AUTO_LOWER,
	E_TWO_PALLET_STATE.MANUAL_LOWER:
		xLiftDownCommand := TRUE;
		IF Input.xLiftDown AND NOT Input.xLiftUp THEN
			IF Diag.eState = E_TWO_PALLET_STATE.AUTO_LOWER THEN
				Diag.eState := E_TWO_PALLET_STATE.AUTO_MOVE_TO_EXCHANGE;
				lrTarget := Config.lrExchange;
			ELSE
				Diag.eState := E_TWO_PALLET_STATE.IDLE;
			END_IF;
		END_IF;

	E_TWO_PALLET_STATE.AUTO_MOVE_TO_EXCHANGE,
	E_TWO_PALLET_STATE.AUTO_MOVE_TO_WORK,
	E_TWO_PALLET_STATE.MANUAL_MOVE:
		IF Diag.eState = E_TWO_PALLET_STATE.AUTO_MOVE_TO_WORK THEN
			lrTarget := Config.lrWorkP1;
			IF uiTo = UINT#2 THEN
				lrTarget := Config.lrWorkP2;
			END_IF;
		END_IF;

		IF NOT Input.xLiftDown
			OR Input.xLiftUp
			OR NOT xPairValid
			OR Status.xHomeRequired
			OR ((Diag.eState = E_TWO_PALLET_STATE.AUTO_MOVE_TO_EXCHANGE) AND (uiSelected <> uiFrom))
			OR ((Diag.eState = E_TWO_PALLET_STATE.AUTO_MOVE_TO_WORK) AND (uiSelected <> uiTo))
			OR ((Diag.eState = E_TWO_PALLET_STATE.MANUAL_MOVE) AND (uiSelected <> uiManualSelected))
			OR (Input.xLimitPositive AND (lrTarget > Input.lrPosition + Config.lrTolerance))
			OR (Input.xLimitNegative AND (lrTarget < Input.lrPosition - Config.lrTolerance)) THEN
			Error.dwErrorActive := Error.dwErrorActive OR ERR_LOGIC;
			Diag.eState := E_TWO_PALLET_STATE.IDLE;
			Output.xStop := TRUE;
		ELSE
			Output.lrTarget := lrTarget;
			Output.xMove := xStateEntry;
			IF Input.xStandstill
				AND (ABS(Input.lrPosition - lrTarget) <= Config.lrTolerance)
				AND ((xSeenMotion OR xSeenDone) OR xStateEntry) THEN
				Output.xMove := FALSE;
				IF Diag.eState = E_TWO_PALLET_STATE.AUTO_MOVE_TO_EXCHANGE THEN
					Diag.eState := E_TWO_PALLET_STATE.AUTO_SELECT_PALLET;
				ELSIF Diag.eState = E_TWO_PALLET_STATE.AUTO_MOVE_TO_WORK THEN
					Diag.eState := E_TWO_PALLET_STATE.AUTO_RAISE;
				ELSE
					Diag.eState := E_TWO_PALLET_STATE.IDLE;
				END_IF;
			END_IF;
		END_IF;

	E_TWO_PALLET_STATE.AUTO_SELECT_PALLET,
	E_TWO_PALLET_STATE.MANUAL_SELECT_PALLET:
		IF NOT xExchange OR NOT Input.xLiftDown OR Input.xLiftUp THEN
			Error.dwErrorActive := Error.dwErrorActive OR ERR_LOGIC;
			Diag.eState := E_TWO_PALLET_STATE.IDLE;
			Output.xStop := TRUE;
		ELSE
			xSelectCommand := TRUE;
		END_IF;
		IF (uiSelected = uiTo) AND xPairValid AND NOT Output.xStop THEN
			IF Diag.eState = E_TWO_PALLET_STATE.AUTO_SELECT_PALLET THEN
				Diag.eState := E_TWO_PALLET_STATE.AUTO_MOVE_TO_WORK;
			ELSE
				Diag.eState := E_TWO_PALLET_STATE.IDLE;
			END_IF;
		END_IF;

	E_TWO_PALLET_STATE.MANUAL_LOCK:
		IF xManualLockOutTarget THEN
			xManualLockCommand := NOT Input.xLockOut OR Input.xLockIn;
			IF Input.xLockOut AND NOT Input.xLockIn THEN Diag.eState := E_TWO_PALLET_STATE.IDLE; END_IF;
		ELSE
			xManualLockCommand := NOT Input.xLockIn OR Input.xLockOut;
			IF Input.xLockIn AND NOT Input.xLockOut THEN Diag.eState := E_TWO_PALLET_STATE.IDLE; END_IF;
		END_IF;

	E_TWO_PALLET_STATE.MANUAL_STOP:
		IF xManualStopOutTarget THEN
			xManualStopCommand := NOT Input.xStopOut OR Input.xStopIn;
			IF Input.xStopOut AND NOT Input.xStopIn THEN Diag.eState := E_TWO_PALLET_STATE.IDLE; END_IF;
		ELSE
			xManualStopCommand := NOT Input.xStopIn OR Input.xStopOut;
			IF Input.xStopIn AND NOT Input.xStopOut THEN Diag.eState := E_TWO_PALLET_STATE.IDLE; END_IF;
		END_IF;

	E_TWO_PALLET_STATE.AUTO_RAISE:
		// Завершение обмена устанавливает подъём по выбранной конфигурации
		// только после фактического останова в рабочей позиции.
		IF NOT xWork
			OR Status.xHomeRequired
			OR (uiSelected <> uiTo) THEN
			Error.dwErrorActive := Error.dwErrorActive OR ERR_LOGIC;
			Diag.eState := E_TWO_PALLET_STATE.IDLE;
			Output.xStop := TRUE;
		ELSE
			xLiftUpCommand := (uiTargetSignals AND UINT#2) <> UINT#0;
			xLiftDownCommand := NOT xLiftUpCommand;
			IF uiSignals = uiTargetSignals THEN
				Status.uiRobotPallet := uiTo;
				uiConfirmedCandidate := uiTo;
				Status.xConfirmed := TRUE;
				Status.xCompleted := TRUE;
				Diag.eState := E_TWO_PALLET_STATE.IDLE;
			END_IF;
		END_IF;

	E_TWO_PALLET_STATE.MANUAL_RAISE:
		// Наладочный подъём не требует HOME-координаты или рабочей позиции.
		IF NOT Input.xStandstill OR NOT xManual OR xContradiction OR Status.xHomeRequired THEN
			Error.dwErrorActive := Error.dwErrorActive OR ERR_LOGIC;
			Diag.eState := E_TWO_PALLET_STATE.IDLE;
			Output.xStop := TRUE;
		ELSE
			xLiftUpCommand := TRUE;
			IF Input.xLiftUp AND NOT Input.xLiftDown THEN
				Diag.eState := E_TWO_PALLET_STATE.IDLE;
			END_IF;
		END_IF;

	E_TWO_PALLET_STATE.MANUAL_HOME:
		Output.xHome := xStateEntry;
		IF xSeenDone
			AND Input.xHomed
			AND Input.xStandstill
			AND NOT xStateEntry THEN
			Status.xHomeRequired := FALSE;
			Diag.eState := E_TWO_PALLET_STATE.IDLE;
		END_IF;

	E_TWO_PALLET_STATE.MANUAL_JOG:
		IF tonJogLease.Q OR NOT xConnection OR (uiJogDirection = UINT#0) THEN
			Diag.eState := E_TWO_PALLET_STATE.IDLE;
			Output.xStop := TRUE;
		ELSE
			Output.xJogPositive := (uiJogDirection = JOG_POSITIVE) AND NOT Input.xLimitPositive;
			Output.xJogNegative := (uiJogDirection = JOG_NEGATIVE) AND NOT Input.xLimitNegative;
		END_IF;

	E_TWO_PALLET_STATE.IDLE:
		uiJogDirection := UINT#0;

ELSE
	Error.dwErrorActive := Error.dwErrorActive OR ERR_LOGIC;
	Diag.eState := E_TWO_PALLET_STATE.IDLE;
	Output.xStop := TRUE;
END_CASE;
IF Diag.eState = E_TWO_PALLET_STATE.IDLE THEN xExchangeStartedManual := FALSE; END_IF;

// Низ П2 и выбранное зацепление контролируются всё время Home/JOG.
IF ((Diag.eState = E_TWO_PALLET_STATE.MANUAL_HOME)
	OR (Diag.eState = E_TWO_PALLET_STATE.MANUAL_JOG))
	AND (NOT Input.xLiftDown
		OR Input.xLiftUp
		OR NOT xPairValid
		OR (uiSelected <> uiManualSelected)
		OR xContradiction
		OR Input.xDriveError
		OR NOT Input.xPowered) THEN
	Error.dwErrorActive := Error.dwErrorActive OR ERR_LOGIC;
	Diag.eState := E_TWO_PALLET_STATE.IDLE;
	Output.xStop := TRUE;
END_IF;

IF tonState.Q THEN
	IF (ePreviousState = E_TWO_PALLET_STATE.AUTO_MOVE_TO_EXCHANGE)
		OR (ePreviousState = E_TWO_PALLET_STATE.AUTO_MOVE_TO_WORK)
		OR (ePreviousState = E_TWO_PALLET_STATE.MANUAL_MOVE)
		OR (ePreviousState = E_TWO_PALLET_STATE.MANUAL_HOME) THEN
		Error.dwErrorActive := Error.dwErrorActive OR ERR_MOTION_TIMEOUT;
		Status.xHomeRequired := TRUE;
	ELSE
		Error.dwErrorActive := Error.dwErrorActive OR ERR_CYLINDER_TIMEOUT;
	END_IF;
	Diag.eState := E_TWO_PALLET_STATE.IDLE;
	Output.xStop := TRUE;
END_IF;

IF (((NOT xBase) AND NOT (xManualPneumaticState AND xPneumaticBase))
	OR ((NOT xConnection) AND NOT xManualPneumaticState))
	AND (ePreviousState <> E_TWO_PALLET_STATE.IDLE)
	OR Output.xStop THEN
	Output.xMove := FALSE;
	Output.xHome := FALSE;
	Output.xJogPositive := FALSE;
	Output.xJogNegative := FALSE;
	xLiftUpCommand := FALSE;
	xLiftDownCommand := FALSE;
	xSelectCommand := FALSE;
	xManualLockCommand := FALSE;
	xManualStopCommand := FALSE;
END_IF;

// Автоматический обмен переключает пару совместно; ручное восстановление — каждый цилиндр отдельно.
xLockOutTarget := (uiTargetSignals AND UINT#8) <> UINT#0;
xStopOutTarget := (uiTargetSignals AND UINT#32) <> UINT#0;
Output.xLiftUp := xBase AND xLiftUpCommand AND NOT tonCoil.Q;
Output.xLiftDown := (xBase OR xPneumaticBase) AND xLiftDownCommand AND NOT tonCoil.Q;
Output.xLockOut := (xBase AND xSelectCommand AND xLockOutTarget
	OR xPneumaticBase AND xManualLockCommand AND xManualLockOutTarget) AND NOT tonCoil.Q;
Output.xLockIn := (xBase AND xSelectCommand AND NOT xLockOutTarget
	OR xPneumaticBase AND xManualLockCommand AND NOT xManualLockOutTarget) AND NOT tonCoil.Q;
Output.xStopOut := (xBase AND xSelectCommand AND xStopOutTarget
	OR xPneumaticBase AND xManualStopCommand AND xManualStopOutTarget) AND NOT tonCoil.Q;
Output.xStopIn := (xBase AND xSelectCommand AND NOT xStopOutTarget
	OR xPneumaticBase AND xManualStopCommand AND NOT xManualStopOutTarget) AND NOT tonCoil.Q;

// Поза для 3D — оценка по координате каретки и подтверждённому зацеплению.
IF xPairValid AND Input.xHomed THEN
	lrSpan := lrWork - Config.lrExchange;
	IF ABS(lrSpan) > Config.lrTolerance THEN
		rTravel := LREAL_TO_REAL(
			LIMIT(0.0, (Input.lrPosition - Config.lrExchange) / lrSpan, 1.0));
		IF uiSelected = UINT#1 THEN
			Status.rP1 := rTravel;
		ELSE
			Status.rP2 := rTravel;
		END_IF;
	END_IF;
END_IF;

IF Input.xLiftUp AND NOT Input.xLiftDown THEN
	Status.rLift := 1.0;
ELSIF Input.xLiftDown AND NOT Input.xLiftUp THEN
	Status.rLift := 0.0;
END_IF;

// Диагностика и совместимый публичный Status формируются в одном месте.
IF (Error.dwErrorActive <> dwPreviousError)
	AND (Error.dwErrorActive <> DWORD#0) THEN
	Diag.eFaultState := ePreviousState;
END_IF;
dwPreviousError := Error.dwErrorActive;

IF Error.dwErrorActive <> DWORD#0 THEN
	Error.dwErrorLast := Error.dwErrorActive;
	Status.xConfirmed := FALSE;
	Status.xEnabled := FALSE;
END_IF;
Error.dwAlarmActive := Error.dwErrorActive;
Error.stErrorActive := UpdateErrorView(dwError := Error.dwErrorActive);
Error.stErrorLast := UpdateErrorView(dwError := Error.dwErrorLast);

Status.uiStep := TO_UINT(Diag.eState);
Status.uiFaultStep := TO_UINT(Diag.eFaultState);
Status.uiReason := Diag.uiReason;
Status.dwError := Error.dwErrorActive;
Status.stWarning := Diag.stWarning;
Status.xBusy := Diag.eState <> E_TWO_PALLET_STATE.IDLE;
Status.xError := Error.dwErrorActive <> DWORD#0;

// Команда или автомат могли занять механизм после первоначального расчёта
// разрешений. Не публикуем устаревшее разрешение ещё на один скан.
IF Status.xBusy THEN
	Status.xConfirmAllowed := FALSE;
	Status.xStartAllowed := FALSE;
	Status.xEnableAllowed := FALSE;
	Status.xSwapAllowed := FALSE;
	Status.xPowerAllowed := FALSE;
	Status.xDriveResetAllowed := FALSE;
	Status.xHomeAllowed := FALSE;
	Status.xLowerAllowed := FALSE;
	Status.xRaiseAllowed := FALSE;
	Status.xSelectAllowed := FALSE;
	Status.xLockAllowed := FALSE;
	Status.xStopAllowed := FALSE;
	Status.xMoveAllowed := FALSE;
	Status.xJogAllowed := FALSE;
	Status.xTeachOperatorAllowed := FALSE;
	Status.xTeachWorkAllowed := FALSE;
	Status.xResetAllowed := FALSE;
	Status.xConfigAllowed := FALSE;
END_IF;

// Инвентарь операторской палеты редактируется всегда, независимо от режима,
// движения, подтверждения, питания и ошибок механизма. Роботная палета — только
// при выключенном магазине после освобождения текущей/выданной операции с ним.
// Считаем после команд и обмена, чтобы роль палеты была актуальна в этом скане.
Status.xEdit1Allowed := xSelected
	AND ((Status.uiRobotPallet <> UINT#1) OR (NOT Status.xEnabled AND xActivePalletEditAllowed));
Status.xEdit2Allowed := xSelected
	AND ((Status.uiRobotPallet <> UINT#2) OR (NOT Status.xEnabled AND xActivePalletEditAllowed));
Status.xEditAllowed := Status.xEdit1Allowed OR Status.xEdit2Allowed;

Status.xReady := xSelected
	AND Status.xEnabled
	AND Status.xConfirmed
	AND NOT Status.xBusy
	AND NOT Status.xError
	AND xWork
	AND (uiCandidate = Status.uiRobotPallet)
	AND Input.xPowered
	AND xRobotGeometryReady
	AND xRobotMagazineReady
	AND xSafe
	AND xConnection;

IF NOT xSelected THEN
	Status.xEnabled := FALSE;
	Status.xConfirmed := FALSE;
END_IF;
