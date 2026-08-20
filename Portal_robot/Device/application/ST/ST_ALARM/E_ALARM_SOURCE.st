TYPE E_ALARM_SOURCE :
(
	CELL, // Ячейка
	ROBOT, // Робот
	MACHINE_1, // Станок 1
	MACHINE_2, // Станок 2
	MACHINE_3, // Станок 3
	MAGAZINE_LOGIC_1, // Магазин 1; имя не конфликтует с SoftMotion-осью Magazine_1
	MAGAZINE_LOGIC_2, // Магазин 2; имя не конфликтует с SoftMotion-осью Magazine_2
	MAGAZINE_AXIS_1, // Сервопривод магазина 1
	MAGAZINE_AXIS_2, // Сервопривод магазина 2
	AXIS_X, // Ось X
	AXIS_Y, // Ось Y
	AXIS_Z, // Ось Z
	AXIS_GROUP, // Группа осей XYZ
	MOTION_MANAGER, // Менеджер движения
	POINT_MANAGER, // Менеджер точек
	GRIPPER // Захват робота
);
END_TYPE
