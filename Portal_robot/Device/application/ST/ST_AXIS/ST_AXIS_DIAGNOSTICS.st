TYPE ST_AXIS_DIAGNOSTICS :
STRUCT
    iStep            : E_AXIS_STATE; // Текущий шаг автомата оси
    iLastErrorStep   : INT; // Шаг, на котором возникла последняя ошибка
    sStepName        : STRING[80]; // Текстовое имя текущего шага
    sWaitReason      : STRING[120]; // Причина ожидания на текущем шаге
    sErrorText       : STRING[120]; // Текст активной ошибки
    sWarningText     : STRING[120]; // Текст активного предупреждения
    tStepElapsed     : TIME; // Время нахождения на текущем шаге
    tStepPreset      : TIME; // Допустимое время текущего шага
    xStepTimeout     : BOOL; // Превышено допустимое время шага
    udiActualErrorID : UDINT; // Код активной ошибки
    udiLastErrorID   : UDINT; // Код последней ошибки
END_STRUCT
END_TYPE
