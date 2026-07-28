TYPE ST_MACHINE_PUBLIC :
STRUCT
	xProcessing          : BOOL; // Станок выполняет цикл обработки
    xPartReady           : BOOL; // Обработка детали завершена
    xServiceRequired     : BOOL; // Станку требуется обслуживание роботом
    xCanAcceptService    : BOOL; // Станок готов принять робота
    xRobotReleased       : BOOL; // Робот освобождён после операции
	xDone                : BOOL; // Операция обслуживания завершена
    xBusy                : BOOL; // Блок выполняет операцию обслуживания
    xError               : BOOL; // Станок находится в ошибке
	xCriticalError       : BOOL; // Активна критическая ошибка
	xAlarmError          : BOOL; // Активна некритическая ошибка станка
	xExternalError       : BOOL; // Активна внешняя ошибка
    xDoorOpen            : BOOL; // Дверь станка открыта
    xAlarm               : BOOL; // Активна авария станка
    eRecommendedOperation: E_MACHINE_OPERATION; // Рекомендуемая операция обслуживания
    ePartState           : E_PART_STATE; // Состояние детали в патроне
    eAbovePoint          : E_POINT_NAME; // Имя точки над станком
    lrAboveX             : LREAL; // Координата X точки над станком
    tRemaining           : TIME; // Оставшееся время обработки
END_STRUCT
END_TYPE
