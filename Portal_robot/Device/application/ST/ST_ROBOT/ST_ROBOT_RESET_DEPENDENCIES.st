TYPE ST_ROBOT_RESET_DEPENDENCIES :
STRUCT
	// Внутренний PLC-контракт: биты 0..2 — станки, 3..4 — магазины,
	// 5..6 — ГК, 7..8 — механизмы двухпалетных магазинов.
	dwStopOwners : DWORD; // Владельцы текущего зависимого ROBOT_STOP
	dwLiveCauses : DWORD; // Непосредственные удерживаемые причины этих владельцев
	dwResetBusy : DWORD; // Выполняющийся аппаратный/асинхронный сброс владельца
END_STRUCT
END_TYPE
