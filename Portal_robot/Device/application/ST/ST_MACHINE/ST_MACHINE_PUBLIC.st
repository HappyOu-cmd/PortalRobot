TYPE ST_MACHINE_PUBLIC :
STRUCT
	xEnabled             : BOOL; // Станок включен в работу
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
	tCycleExpected       : TIME; // Ожидаемое время текущего цикла
	tCycleElapsed        : TIME; // Прошедшее время текущего цикла
	tMeasuredCycle       : TIME; // Последнее измеренное время корректного автоцикла
	tRemaining           : TIME; // Оставшееся время обработки
	xCycleTimeValid      : BOOL; // Доступна оценка времени цикла
	xMeasuredTimeValid   : BOOL; // Получено измерение корректного автоцикла
	xCycleOvertime       : BOOL; // Фактический цикл превысил ожидаемое время
END_STRUCT
END_TYPE
