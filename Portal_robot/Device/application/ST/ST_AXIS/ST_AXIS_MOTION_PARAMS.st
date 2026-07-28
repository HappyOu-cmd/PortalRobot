TYPE ST_AXIS_MOTION_PARAMS :
STRUCT
    lrTargetPosition : LREAL; // Целевая абсолютная позиция
    lrDistance       : LREAL; // Дистанция относительного перемещения
    lrHomePosition   : LREAL; // Координата домашней позиции
    lrVelocity       : LREAL; // Скорость движения
    lrAcceleration   : LREAL; // Ускорение
    lrDeceleration   : LREAL; // Замедление
    lrJerk           : LREAL; // Рывок
END_STRUCT
END_TYPE
