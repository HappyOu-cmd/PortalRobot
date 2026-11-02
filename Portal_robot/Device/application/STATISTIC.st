PROGRAM STATISTIC
VAR
END_VAR

// --- BEGIN IMPLEMENTATION ---

// Совместимость со старой Task Configuration: программа больше не пишет данные.
// Сбор и расчёт перенесены в PLC_PRG.RunStatistics, единственный владелец — MainTask.
// После импорта удалить вызов STATISTIC и отдельную StatisticTask в CODESYS.
