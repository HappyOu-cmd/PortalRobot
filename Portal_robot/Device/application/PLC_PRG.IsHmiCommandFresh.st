METHOD PRIVATE IsHmiCommandFresh : BOOL
VAR_INPUT
	udiIssuedAtMs : UDINT;
END_VAR
VAR
	uliAgeMs : ULINT;
END_VAR

// --- BEGIN IMPLEMENTATION ---

// Explicit modulo-2^32 age: TIME() rolls over after about 49 days.
IF udiHmiCommandNowMs >= udiIssuedAtMs THEN
	uliAgeMs := UDINT_TO_ULINT(udiHmiCommandNowMs) - UDINT_TO_ULINT(udiIssuedAtMs);
ELSE
	uliAgeMs := ULINT#4294967296 + UDINT_TO_ULINT(udiHmiCommandNowMs) - UDINT_TO_ULINT(udiIssuedAtMs);
END_IF;
IsHmiCommandFresh := uliAgeMs <= ULINT#3000;
