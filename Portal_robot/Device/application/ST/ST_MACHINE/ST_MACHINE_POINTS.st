TYPE ST_MACHINE_POINTS :
STRUCT
	eNone          : E_POINT_NAME; // Пустое имя точки
	eAbove         : E_POINT_NAME; // Точка над рабочей зоной станка
	eInside        : E_POINT_NAME; // Точка внутри рабочей зоны станка
	eChuckApproach : E_POINT_NAME; // Точка подхода к патрону
	eChuck         : E_POINT_NAME; // Рабочая точка патрона
END_STRUCT
END_TYPE
