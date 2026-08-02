TYPE ST_AXIS_ERROR_CODES :
STRUCT
    dwAxisErrorActual     : DWORD; // Текущие ошибки блоков SoftMotion
    dwAxisErrorLatched    : DWORD; // Защёлкнутые ошибки SoftMotion
    dwAxisError           : DWORD; // Общая активная маска ошибок оси
    dwAxisErrorLast       : DWORD; // Последняя ненулевая маска ошибок оси
    dwDriveAxisErrorID    : DWORD; // Код ошибки привода
    dwLogicalErrorLatched : DWORD; // Защёлкнутые логические ошибки
    dwLogicalError        : DWORD; // Общая активная маска логических ошибок
    dwLogicalErrorLast    : DWORD; // Последняя ненулевая маска логических ошибок
    dwWarningLatched      : DWORD; // Защёлкнутые предупреждения
    dwWarning             : DWORD; // Активные предупреждения
    dwAllError            : DWORD; // Сводная маска ошибок
    dwAlarmActive         : DWORD; // Собственные аварии оси для общего журнала
    stErrorActive         : ST_AXIS_ERROR; // Расшифровка активных ошибок
    stErrorLast           : ST_AXIS_ERROR; // Расшифровка последних ошибок
END_STRUCT
END_TYPE
