"""Aero Telemetry v1: reference codec, fragmentation and sequence diagnostics."""
from dataclasses import dataclass,asdict
import math
import struct

MAGIC=b'AT'
BODY=struct.Struct('<BBIQfff')
MAX_BODY=256

def crc16(data):
    value=0xffff
    for byte in data:
        value ^= byte<<8
        for _ in range(8): value=((value<<1)^0x1021)&0xffff if value&0x8000 else (value<<1)&0xffff
    return value

@dataclass(frozen=True)
class Telemetry:
    sequence: int
    timestamp_ms: int
    altitude_m: float
    airspeed_ms: float
    battery_pct: float
    def validate(self):
        if not isinstance(self.sequence,int) or not 0 <= self.sequence <= 0xffffffff: raise ValueError('Sequence must be uint32.')
        if not isinstance(self.timestamp_ms,int) or not 0 <= self.timestamp_ms <= 0xffffffffffffffff: raise ValueError('Timestamp must be uint64.')
        if not all(math.isfinite(v) and abs(v)<=3.402823466e38 for v in [self.altitude_m,self.airspeed_ms,self.battery_pct]): raise ValueError('Measurements must fit finite float32.')
        if self.airspeed_ms<0 or not 0 <= self.battery_pct <= 100: raise ValueError('Airspeed must be nonnegative and battery within 0–100%.')

def encode(sample):
    sample.validate()
    body=BODY.pack(1,1,sample.sequence,sample.timestamp_ms,sample.altitude_m,sample.airspeed_ms,sample.battery_pct)
    protected=struct.pack('<H',len(body))+body
    return MAGIC+protected+struct.pack('<H',crc16(protected))

def decode(packet):
    if len(packet)<6 or packet[:2]!=MAGIC: raise ValueError('Invalid packet prefix or size.')
    length=struct.unpack_from('<H',packet,2)[0]
    if length!=BODY.size or len(packet)!=length+6: raise ValueError('Invalid v1 body length.')
    if crc16(packet[2:-2])!=struct.unpack_from('<H',packet,len(packet)-2)[0]: raise ValueError('CRC mismatch.')
    version,kind,*fields=BODY.unpack(packet[4:-2])
    if version!=1 or kind!=1: raise ValueError('Unsupported version or message type.')
    sample=Telemetry(*fields); sample.validate(); return sample

class StreamDecoder:
    def __init__(self):
        self.buffer=bytearray(); self.rejected=0; self.discarded_bytes=0
    def feed(self,chunk):
        self.buffer.extend(chunk); samples=[]
        while True:
            index=self.buffer.find(MAGIC)
            if index<0:
                keep=1 if self.buffer.endswith(MAGIC[:1]) else 0
                count=len(self.buffer)-keep; self.discarded_bytes+=count
                del self.buffer[:count]; break
            if index: self.discarded_bytes+=index; del self.buffer[:index]
            if len(self.buffer)<4: break
            length=struct.unpack_from('<H',self.buffer,2)[0]
            # Only fixed-size v1 telemetry is supported; reject unknown sizes immediately.
            if length!=BODY.size:
                self.rejected+=1; self.discarded_bytes+=1; del self.buffer[0]; continue
            size=length+6
            if len(self.buffer)<size: break
            try: sample=decode(bytes(self.buffer[:size]))
            except ValueError:
                self.rejected+=1; self.discarded_bytes+=1; del self.buffer[0]; continue
            samples.append(sample); del self.buffer[:size]
        return samples

class SequenceTracker:
    def __init__(self): self.last=None; self.missing=0; self.duplicates=0; self.out_of_order=0
    def observe(self,sequence):
        if self.last is None: self.last=sequence; return 'first'
        delta=(sequence-self.last)&0xffffffff
        if delta==0: self.duplicates+=1; return 'duplicate'
        if delta>=0x80000000: self.out_of_order+=1; return 'out_of_order'
        self.missing+=delta-1; self.last=sequence
        return 'gap' if delta>1 else 'in_order'
