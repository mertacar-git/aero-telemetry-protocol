#include "aero_telemetry.hpp"
#include <cassert>
#include <iomanip>
#include <iostream>

int main() {
    const std::vector<std::uint8_t> known={'1','2','3','4','5','6','7','8','9'};
    assert(aero::crc16(known.data(),known.size())==0x29b1);
    const aero::Telemetry sample{42,1000,120,18,85};
    const auto packet=aero::encode(sample);
    const auto decoded=aero::decode(packet);
    assert(decoded.sequence==42&&decoded.timestamp_ms==1000&&decoded.altitude_m==120);
    for(std::size_t size=1;size<=32;++size) {
        aero::StreamDecoder parser;
        std::vector<aero::Telemetry> values;
        for(std::size_t i=0;i<packet.size();i+=size) {
            auto chunk=parser.feed(std::vector<std::uint8_t>(packet.begin()+i,packet.begin()+std::min(packet.size(),i+size)));
            values.insert(values.end(),chunk.begin(),chunk.end());
        }
        assert(values.size()==1&&parser.pending_bytes()==0);
    }
    auto bad=packet; bad[18]^=1;
    aero::StreamDecoder parser;
    auto stream=bad; stream.insert(stream.end(),packet.begin(),packet.end());
    assert(parser.feed(stream).size()==1&&parser.rejected==1);
    for(auto byte:packet) std::cout<<std::hex<<std::setw(2)<<std::setfill('0')<<static_cast<int>(byte);
    std::cout<<'\n';
}
