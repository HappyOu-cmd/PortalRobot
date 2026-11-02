TYPE ST_HMI_DATA_REVISION :
STRUCT
    uiVersion : UINT; // 1: чтение таблиц по ревизии; 0: начальная публикация не завершена
    udiEpoch : UDINT; // TIME() при первой публикации, отличает повторный старт приложения
    udiMagazineInventory : UDINT; // astMagazineInventory и совместимый astMagazineSlot
    udiTwinStore : UDINT; // astTwinStore, включая подтверждения axLoaded
    udiAlarmEvents : UDINT; // astAlarmEvent: добавление И снятие/подтверждение событий
END_STRUCT
END_TYPE
