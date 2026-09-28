{attribute 'qualified_only'}
VAR_GLOBAL
	astPartStatus : ARRAY [1..2] OF ST_MAGAZINE_STATUS; // Статус только операций робота, без механического обмена
	astAutoCommand : ARRAY [1..GVL_CELL_SETTINGS.MagazineCount] OF ST_MAGAZINE_COMMAND;
	astCommand : ARRAY [1..GVL_CELL_SETTINGS.MagazineCount] OF ST_ROBOT_COMMAND;
	astStatus : ARRAY [1..GVL_CELL_SETTINGS.MagazineCount] OF ST_MAGAZINE_STATUS;
	astDiag : ARRAY [1..GVL_CELL_SETTINGS.MagazineCount] OF ST_MAGAZINE_DIAG;
	astError : ARRAY [1..GVL_CELL_SETTINGS.MagazineCount] OF ST_MAGAZINE_ERRORS;
END_VAR
