TYPE ST_MAGAZINE_CALIBRATION :
STRUCT
	uiMethod : UINT := UINT#1; // 1: база и мировые X/Y; 3: база A и направления B/C
	astReference : ARRAY [1..2] OF ST_POINT; // B: последний слот первого ряда; C: первый слот последнего ряда
END_STRUCT
END_TYPE
