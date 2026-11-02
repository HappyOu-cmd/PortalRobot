TYPE ST_STATISTIC_SAMPLE :
STRUCT
    uliElapsedMs : ULINT; // Накопленное время сессии с учётом ускорения
    auliBusyMs : ARRAY [1..11] OF ULINT; // Завершённые и текущие интервалы
    auliCompletedBusyMs : ARRAY [1..11] OF ULINT; // Только завершённые интервалы
    auliCompletedCount : ARRAY [1..11] OF ULINT;
END_STRUCT
END_TYPE
