# Aero Telemetry v1

All multibyte fields are little-endian. Packets are 32 bytes.

| Offset | Bytes | Field |
|---|---|---|
| 0 | 2 | ASCII magic `AT` |
| 2 | 2 | uint16 body length, fixed at 26 |
| 4 | 1 | Version, 1 |
| 5 | 1 | Message type, telemetry = 1 |
| 6 | 4 | uint32 sequence |
| 10 | 8 | uint64 sender-defined monotonic timestamp, milliseconds |
| 18 | 4 | IEEE-754 float32 altitude, meters |
| 22 | 4 | IEEE-754 float32 airspeed, meters/second |
| 26 | 4 | IEEE-754 float32 battery, percent |
| 30 | 2 | CRC of bytes 2–29, little-endian |

CRC-16/CCITT-FALSE: polynomial 0x1021, initial value 0xffff, no reflection, xor-out 0. The `123456789` check value is 0x29b1.

The CRC covers the length and body; magic is used for synchronization. The decoder accepts only v1 telemetry with the fixed body length. Unknown length, version, type, invalid measurements and checksum failures are rejected. Streaming parsers preserve incomplete input, search for magic, and advance one byte after a rejected candidate.

Sequence diagnostics use unsigned modulo-2^32 arithmetic. A forward difference below 2^31 is treated as ordered; zero is duplicate; a difference at least 2^31 is out of order. Missing-count estimates cannot distinguish deliberate sequence skips from lost packets. A sender restart needs a new tracker.

CRC is not authentication or encryption. This is a custom educational wire protocol, not MAVLink, CCSDS or an aviation certification standard.
