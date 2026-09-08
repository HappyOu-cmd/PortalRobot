{attribute 'qualified_only'}
{attribute 'strict'}
TYPE E_POINT_NAME :
(	
	NONE,
	MACHINE_1_ABOVE,
	MACHINE_1_INSIDE, // Legacy: исключена из редактора, сохранена ради числового протокола
	MACHINE_1_CHUCK_APROACH,
	MACHINE_1_CHUCK_POSITION,
	MACHINE_2_ABOVE,
	MACHINE_2_INSIDE, // Legacy: исключена из редактора, сохранена ради числового протокола
	MACHINE_2_CHUCK_APROACH,
	MACHINE_2_CHUCK_POSITION,
	MACHINE_3_ABOVE,
	MACHINE_3_INSIDE, // Legacy: исключена из редактора, сохранена ради числового протокола
	MACHINE_3_CHUCK_APROACH,
	MACHINE_3_CHUCK_POSITION,
	MAGAZINE_DETAIL,
	MAGAZINE_TAKE_DETAIL,
	MAGAZINE_PUT_DETAIL,
	MAGAZINE_CHANGE_DETAIL,
	HOME_SAFETY,
	MAGAZINE_RETURN_BLANK, // Legacy: сохранено только ради прежнего числового значения
	MAGAZINE_SAFE, // Безопасная точка над активным слотом
	MAGAZINE_IN_SLOT, // Рабочая точка внутри активного слота
	MAGAZINE_CHANGE, // Безопасная точка переворота над активным слотом
	MAGAZINE_1_DETAIL, // Базовая точка рабочей зоны первого магазина
	MAGAZINE_2_DETAIL // Базовая точка рабочей зоны второго магазина

);
END_TYPE
