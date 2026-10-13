#pragma once
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <limits>
#include <stdexcept>
#include <vector>

namespace aero {
struct Telemetry {
    std::uint32_t sequence;
    std::uint64_t timestamp_ms;
    float altitude_m, airspeed_ms, battery_pct;
};
inline std::uint16_t crc16(const std::uint8_t* data, std::size_t size) {
    std::uint16_t crc=0xffff;
    for (std::size_t i=0;i<size;++i) {
        crc ^= static_cast<std::uint16_t>(data[i])<<8;
        for (int bit=0;bit<8;++bit) crc=static_cast<std::uint16_t>((crc&0x8000)?(crc<<1)^0x1021:crc<<1);
    }
    return crc;
}
inline void append_le(std::vector<std::uint8_t>& out, std::uint64_t value, int bytes) {
    for(int i=0;i<bytes;++i) out.push_back(static_cast<std::uint8_t>(value>>(8*i)));
}
inline std::uint64_t read_le(const std::uint8_t* data,int bytes) {
    std::uint64_t value=0;
    for(int i=0;i<bytes;++i) value|=static_cast<std::uint64_t>(data[i])<<(8*i);
    return value;
}
inline void validate(const Telemetry& value) {
    if(!std::isfinite(value.altitude_m)||!std::isfinite(value.airspeed_ms)||!std::isfinite(value.battery_pct)||value.airspeed_ms<0||value.battery_pct<0||value.battery_pct>100)
        throw std::invalid_argument("Invalid measurements");
}
inline void append_float(std::vector<std::uint8_t>& out,float value) {
    static_assert(sizeof(float)==4,"Requires 32-bit float");
    static_assert(std::numeric_limits<float>::is_iec559,"Requires IEEE-754 float");
    std::uint32_t bits; std::memcpy(&bits,&value,4); append_le(out,bits,4);
}
inline float read_float(const std::uint8_t* data) {
    auto bits=static_cast<std::uint32_t>(read_le(data,4));
    float value; std::memcpy(&value,&bits,4); return value;
}
inline std::vector<std::uint8_t> encode(const Telemetry& value) {
    validate(value);
    std::vector<std::uint8_t> out={'A','T',26,0,1,1};
    append_le(out,value.sequence,4); append_le(out,value.timestamp_ms,8);
    append_float(out,value.altitude_m); append_float(out,value.airspeed_ms); append_float(out,value.battery_pct);
    append_le(out,crc16(out.data()+2,out.size()-2),2); return out;
}
inline Telemetry decode(const std::vector<std::uint8_t>& packet) {
    if(packet.size()!=32||packet[0]!='A'||packet[1]!='T'||read_le(packet.data()+2,2)!=26)
        throw std::invalid_argument("Invalid packet length or magic");
    if(crc16(packet.data()+2,28)!=read_le(packet.data()+30,2)) throw std::invalid_argument("CRC mismatch");
    if(packet[4]!=1||packet[5]!=1) throw std::invalid_argument("Unsupported version or type");
    Telemetry value{static_cast<std::uint32_t>(read_le(packet.data()+6,4)),read_le(packet.data()+10,8),read_float(packet.data()+18),read_float(packet.data()+22),read_float(packet.data()+26)};
    validate(value); return value;
}
class StreamDecoder {
    std::vector<std::uint8_t> buffer;
public:
    std::size_t rejected=0, discarded_bytes=0;
    std::size_t pending_bytes() const { return buffer.size(); }
    std::vector<Telemetry> feed(const std::vector<std::uint8_t>& chunk) {
        buffer.insert(buffer.end(),chunk.begin(),chunk.end());
        std::vector<Telemetry> result;
        while(true) {
            std::size_t offset=0;
            while(offset+1<buffer.size()&&!(buffer[offset]=='A'&&buffer[offset+1]=='T')) ++offset;
            if(offset+1>=buffer.size()) {
                const auto keep=(!buffer.empty()&&buffer.back()=='A')?1u:0u;
                discarded_bytes+=buffer.size()-keep;
                buffer.erase(buffer.begin(),buffer.end()-keep); break;
            }
            discarded_bytes+=offset; buffer.erase(buffer.begin(),buffer.begin()+offset);
            if(buffer.size()<4) break;
            if(read_le(buffer.data()+2,2)!=26) { ++rejected; ++discarded_bytes; buffer.erase(buffer.begin()); continue; }
            if(buffer.size()<32) break;
            try { result.push_back(decode(std::vector<std::uint8_t>(buffer.begin(),buffer.begin()+32))); }
            catch(const std::invalid_argument&) { ++rejected; ++discarded_bytes; buffer.erase(buffer.begin()); continue; }
            buffer.erase(buffer.begin(),buffer.begin()+32);
        }
        return result;
    }
};
} // namespace aero
