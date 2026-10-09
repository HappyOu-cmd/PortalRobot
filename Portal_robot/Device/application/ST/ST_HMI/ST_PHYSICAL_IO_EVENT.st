TYPE ST_PHYSICAL_IO_EVENT :
STRUCT
    udiSequence : UDINT;
    uliTimeMs : ULINT; // Монотонное время от старта приложения, без переполнения TIME
    usiDirection : USINT; // 1 DI; 2 DO
    uiIndex : UINT; // DI 1..84; DO 1..50, index из карты I/O
    usiKind : USINT; // 1 клемма DI; 2 вход программы; 3 DO; 4 подмена DI; 5/6 снять DI; 7 ручной DO; 8/9 возврат DO оператором/программе
    xOld : BOOL;
    xNew : BOOL;
END_STRUCT
END_TYPE
