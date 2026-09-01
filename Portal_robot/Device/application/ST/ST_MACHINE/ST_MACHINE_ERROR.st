TYPE ST_MACHINE_ERROR :
STRUCT
	WRONG_OPERATION : BOOL; // Не удалось выбрать операцию
	WRONG_COMMAND   : BOOL; // В рецепте встретилась неизвестная команда
	ROBOT_MOTION    : BOOL; // Ошибка перемещения робота
	ROBOT_ACTION    : BOOL; // Ошибка действия захвата
	DOOR_OPEN       : BOOL; // Не удалось открыть дверь
	DOOR_CLOSE      : BOOL; // Не удалось закрыть дверь
	CHUCK_OPEN      : BOOL; // Не удалось разжать патрон
	CHUCK_CLOSE     : BOOL; // Не удалось зажать патрон
	CYCLE_START     : BOOL; // Не удалось запустить цикл станка
	SAFETY_STOP     : BOOL; // Получена глобальная ошибка ячейки
	UNKNOWN_DETAIL  : BOOL; // Неизвестно состояние детали в станке
	MACHINE_ALARM   : BOOL; // Станок сообщил аварию
	INDEX_ERROR     : BOOL; // Индекс рецепта вышел за границы
	DOOR_ROBOT      : BOOL; // Дверь закрыта при нахождении робота внутри
	MACHINE_IDLE    : BOOL; // Авария станка возникла в ожидании
	TIMEOUT_ROBOT_MOVE    : BOOL; // Превышено время перемещения робота
	TIMEOUT_ROBOT_ACTION  : BOOL; // Превышено время действия захвата
	TIMEOUT_ROBOT_RELEASE : BOOL; // Робот не освободил интерфейс команды вовремя
	TIMEOUT_DOOR_OPEN     : BOOL; // Превышено время открытия двери
	TIMEOUT_DOOR_CLOSE    : BOOL; // Превышено время закрытия двери
	TIMEOUT_CHUCK_OPEN    : BOOL; // Превышено время разжима патрона
	TIMEOUT_CHUCK_CLOSE   : BOOL; // Превышено время зажима патрона
	TIMEOUT_CYCLE_START   : BOOL; // Превышено время подтверждения запуска цикла
	SAFETY_DOOR_OPEN     : BOOL; // Операторская дверь открылась во время обслуживания
END_STRUCT
END_TYPE
