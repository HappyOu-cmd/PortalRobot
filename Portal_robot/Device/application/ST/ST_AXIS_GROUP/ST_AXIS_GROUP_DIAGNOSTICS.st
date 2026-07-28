TYPE ST_AXIS_GROUP_DIAGNOSTICS :
STRUCT
	iStep            : E_AXIS_GROUP_STATE; // Текущий шаг автомата группы
	iOldStep         : E_AXIS_GROUP_STATE; // Предыдущий шаг автомата
	iNewStep         : E_AXIS_GROUP_STATE; // Новый шаг после перехода
	iPowerMode       : E_AXIS_GROUP_POWER_MODE; // Текущий режим питания группы
    iLastErrorStep   : INT; // Шаг возникновения последней ошибки
    sStepName        : STRING[80]; // Текстовое имя текущего шага
    sWaitReason      : STRING[120]; // Причина ожидания на текущем шаге
    sErrorText       : STRING[120]; // Текст активной ошибки
    sWarningText     : STRING[120]; // Текст активного предупреждения
    tStepPreset      : TIME; // Допустимое время текущего шага
    xStepTimeout     : BOOL; // Превышено допустимое время шага
	xStepChanged     : BOOL; // Шаг изменился в текущем цикле
    udiActualErrorID : UDINT; // Код активной ошибки
    udiLastErrorID   : UDINT; // Код последней ошибки
END_STRUCT
END_TYPE
