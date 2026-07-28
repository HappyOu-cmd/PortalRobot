TYPE ST_AXIS_STATUS :
STRUCT
    xPowered            : BOOL; // На привод подано питание
    xBusy               : BOOL; // Ось выполняет команду
    xDone               : BOOL; // Последняя команда завершена
    xError              : BOOL; // Активна любая ошибка оси
    xHomed              : BOOL; // Ось прошла поиск домашней позиции
    xLocalError         : BOOL; // Активна внутренняя ошибка блока
    xMotionBusy         : BOOL; // Активен один из блоков движения
    xCanStartMotion     : BOOL; // Разрешён запуск новой команды движения
    xAxisError          : BOOL; // Активна ошибка привода или SoftMotion
    xLogicalError       : BOOL; // Активна логическая ошибка блока
    xWarning            : BOOL; // Активно предупреждение
    xAxisResetNeeded    : BOOL; // Требуется сброс ошибки привода
    xLogicalResetNeeded : BOOL; // Требуется сброс логической ошибки
	lrActualPosition    : REAL; // Текущая позиция оси
END_STRUCT
END_TYPE
