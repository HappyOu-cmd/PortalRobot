{attribute 'qualified_only'}
VAR_GLOBAL
	// Legacy-объявление оставлено до удаления SoftMotion-узлов Magazine_1/2 через
	// CODESYS. Активная программа массив не читает, не пишет и FB_AXIS для него не создаёт.
	astAxis : ARRAY [1..GVL_CELL_SETTINGS.MagazineCount] OF ST_AXIS;
END_VAR
