TYPE ST_MAGAZINE_ERROR :
STRUCT
	WRONG_OPERATION : BOOL; // Операция не может быть выбрана
	NO_BLANK        : BOOL; // В магазине нет доступной заготовки
	NO_FREE_SLOT    : BOOL; // В магазине нет свободного слота
	INVALID_SLOT    : BOOL; // Номер слота находится вне матрицы
	SLOT_CONTENT    : BOOL; // Содержимое выбранного слота не соответствует операции
	ROBOT_ERROR     : BOOL; // Робот завершил команду с ошибкой
	GLOBAL_STOP     : BOOL; // Получена глобальная ошибка ячейки
	GEOMETRY_ERROR  : BOOL; // Геометрия магазина задана неверно
END_STRUCT
END_TYPE
