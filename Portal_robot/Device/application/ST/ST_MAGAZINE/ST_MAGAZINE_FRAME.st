TYPE ST_MAGAZINE_FRAME :
STRUCT
	stAxisX : ST_MAGAZINE_VECTOR;
	stAxisY : ST_MAGAZINE_VECTOR;
	stAxisZ : ST_MAGAZINE_VECTOR;
	xReady : BOOL;
	uiReason : UINT; // 0 готово; 1 нет базы/Z; 2 неверный метод/сетка; 3 нет B/C; 4 вырожденная плоскость; 5 внешний робот
END_STRUCT
END_TYPE
