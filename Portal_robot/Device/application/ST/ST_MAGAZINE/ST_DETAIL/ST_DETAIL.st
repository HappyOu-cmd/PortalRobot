TYPE ST_DETAIL :
STRUCT
	eDetailType : E_DETAIL_TYPE; // Тип содержимого слота
	xInPosition : BOOL; // Признак наличия объекта в слоте
	uiProductType : UINT; // Тип продукции перемещается между зонами вместе со слотом
END_STRUCT
END_TYPE
