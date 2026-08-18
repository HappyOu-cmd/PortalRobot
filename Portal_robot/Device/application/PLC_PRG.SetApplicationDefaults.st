METHOD PRIVATE SetApplicationDefaults

// --- BEGIN IMPLEMENTATION ---

// =============================================================================
// ТОЧКИ СТАНКА 1
// =============================================================================
//Над станком 1
GVL_POINT.Points[E_POINT_NAME.MACHINE_1_ABOVE].X := 2010;
GVL_POINT.Points[E_POINT_NAME.MACHINE_1_ABOVE].Y := 250;
GVL_POINT.Points[E_POINT_NAME.MACHINE_1_ABOVE].Z := 350;
GVL_POINT.Points[E_POINT_NAME.MACHINE_1_ABOVE].SpeedFactor := 1.0;

//В станке 1
GVL_POINT.Points[E_POINT_NAME.MACHINE_1_INSIDE].X := 1920;
GVL_POINT.Points[E_POINT_NAME.MACHINE_1_INSIDE].Y := 90;
GVL_POINT.Points[E_POINT_NAME.MACHINE_1_INSIDE].Z := 800;
GVL_POINT.Points[E_POINT_NAME.MACHINE_1_INSIDE].SpeedFactor := 1.0;

//У патрона 1
GVL_POINT.Points[E_POINT_NAME.MACHINE_1_CHUCK_APROACH].X := 2010;
GVL_POINT.Points[E_POINT_NAME.MACHINE_1_CHUCK_APROACH].Y := 250;
GVL_POINT.Points[E_POINT_NAME.MACHINE_1_CHUCK_APROACH].Z := 1730;
GVL_POINT.Points[E_POINT_NAME.MACHINE_1_CHUCK_APROACH].SpeedFactor := 1.0;

//В патроне 1
GVL_POINT.Points[E_POINT_NAME.MACHINE_1_CHUCK_POSITION].X := 1880;
GVL_POINT.Points[E_POINT_NAME.MACHINE_1_CHUCK_POSITION].Y := 250;
GVL_POINT.Points[E_POINT_NAME.MACHINE_1_CHUCK_POSITION].Z := 1730;
GVL_POINT.Points[E_POINT_NAME.MACHINE_1_CHUCK_POSITION].SpeedFactor := 1.0;

// =============================================================================
// ТОЧКИ СТАНКА 2
// =============================================================================
//Над станком 2
GVL_POINT.Points[E_POINT_NAME.MACHINE_2_ABOVE].X := 6910;
GVL_POINT.Points[E_POINT_NAME.MACHINE_2_ABOVE].Y := 250;
GVL_POINT.Points[E_POINT_NAME.MACHINE_2_ABOVE].Z := 350;
GVL_POINT.Points[E_POINT_NAME.MACHINE_2_ABOVE].SpeedFactor := 1.0;

//В станке 2
GVL_POINT.Points[E_POINT_NAME.MACHINE_2_INSIDE].X := 6820;
GVL_POINT.Points[E_POINT_NAME.MACHINE_2_INSIDE].Y := 90;
GVL_POINT.Points[E_POINT_NAME.MACHINE_2_INSIDE].Z := 800;
GVL_POINT.Points[E_POINT_NAME.MACHINE_2_INSIDE].SpeedFactor := 1.0;

//У патрона 2
GVL_POINT.Points[E_POINT_NAME.MACHINE_2_CHUCK_APROACH].X := 6910;
GVL_POINT.Points[E_POINT_NAME.MACHINE_2_CHUCK_APROACH].Y := 250;
GVL_POINT.Points[E_POINT_NAME.MACHINE_2_CHUCK_APROACH].Z := 1730;
GVL_POINT.Points[E_POINT_NAME.MACHINE_2_CHUCK_APROACH].SpeedFactor := 1.0;

//В патроне 2
GVL_POINT.Points[E_POINT_NAME.MACHINE_2_CHUCK_POSITION].X := 6780;
GVL_POINT.Points[E_POINT_NAME.MACHINE_2_CHUCK_POSITION].Y := 250;
GVL_POINT.Points[E_POINT_NAME.MACHINE_2_CHUCK_POSITION].Z := 1730;
GVL_POINT.Points[E_POINT_NAME.MACHINE_2_CHUCK_POSITION].SpeedFactor := 1.0;

// =============================================================================
// ТОЧКИ СТАНКА 3
// =============================================================================
//Над станком 3
GVL_POINT.Points[E_POINT_NAME.MACHINE_3_ABOVE].X := 11810;
GVL_POINT.Points[E_POINT_NAME.MACHINE_3_ABOVE].Y := 250;
GVL_POINT.Points[E_POINT_NAME.MACHINE_3_ABOVE].Z := 350;
GVL_POINT.Points[E_POINT_NAME.MACHINE_3_ABOVE].SpeedFactor := 1.0;

//В станке 3
GVL_POINT.Points[E_POINT_NAME.MACHINE_3_INSIDE].X := 11810;
GVL_POINT.Points[E_POINT_NAME.MACHINE_3_INSIDE].Y := 90;
GVL_POINT.Points[E_POINT_NAME.MACHINE_3_INSIDE].Z := 800;
GVL_POINT.Points[E_POINT_NAME.MACHINE_3_INSIDE].SpeedFactor := 1.0;

//У патрона 3
GVL_POINT.Points[E_POINT_NAME.MACHINE_3_CHUCK_APROACH].X := 11810;
GVL_POINT.Points[E_POINT_NAME.MACHINE_3_CHUCK_APROACH].Y := 250;
GVL_POINT.Points[E_POINT_NAME.MACHINE_3_CHUCK_APROACH].Z := 1730;
GVL_POINT.Points[E_POINT_NAME.MACHINE_3_CHUCK_APROACH].SpeedFactor := 1.0;

//В патроне 3
GVL_POINT.Points[E_POINT_NAME.MACHINE_3_CHUCK_POSITION].X := 11680;
GVL_POINT.Points[E_POINT_NAME.MACHINE_3_CHUCK_POSITION].Y := 250;
GVL_POINT.Points[E_POINT_NAME.MACHINE_3_CHUCK_POSITION].Z := 1730;
GVL_POINT.Points[E_POINT_NAME.MACHINE_3_CHUCK_POSITION].SpeedFactor := 1.0;

// =============================================================================
// ТОЧКИ МАГАЗИНА
// =============================================================================
IF NOT xMagazinePointDefaultsInitialized THEN
	// Legacy-база совпадает с первым магазином до обновления всех потребителей.
	GVL_POINT.Points[E_POINT_NAME.MAGAZINE_DETAIL].X := 4230;
	GVL_POINT.Points[E_POINT_NAME.MAGAZINE_DETAIL].Y := 200;
	GVL_POINT.Points[E_POINT_NAME.MAGAZINE_DETAIL].Z := 1600;
	GVL_POINT.Points[E_POINT_NAME.MAGAZINE_DETAIL].SpeedFactor := 1.0;
	GVL_POINT.Points[E_POINT_NAME.MAGAZINE_1_DETAIL] :=
		GVL_POINT.Points[E_POINT_NAME.MAGAZINE_DETAIL];
	// Заглушку второго магазина обязательно откалибровать перед реальным пуском.
	GVL_POINT.Points[E_POINT_NAME.MAGAZINE_2_DETAIL] :=
		GVL_POINT.Points[E_POINT_NAME.MAGAZINE_DETAIL];
	xMagazinePointDefaultsInitialized := TRUE;
END_IF;

// =============================================================================
// БЕЗОПАСНАЯ ТОЧКА ПОВТОРНОГО ЗАПУСКА
// =============================================================================
// Инженерные стартовые координаты. Перед вводом реальной ячейки в эксплуатацию
// точка должна быть подтверждена относительно фактических ограждений и оснастки.
// В отличие от остальных инженерных точек HOME_SAFETY доступна для настройки
// из HMI, поэтому её стартовые значения нельзя перезаписывать каждый цикл.
IF NOT xSafetyHomeDefaultsInitialized THEN
	GVL_POINT.Points[E_POINT_NAME.HOME_SAFETY].X := 0.0;
	GVL_POINT.Points[E_POINT_NAME.HOME_SAFETY].Y := 0.0;
	GVL_POINT.Points[E_POINT_NAME.HOME_SAFETY].Z := 0.0;
	GVL_POINT.Points[E_POINT_NAME.HOME_SAFETY].SpeedFactor := 0.2;
	xSafetyHomeDefaultsInitialized := TRUE;
END_IF;
