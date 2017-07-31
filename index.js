const WorkerBase = require('yeedriver-base/WorkerBase');
const SerialPort = require('serialport');

const pState = {
    'start':'start',
    'collect':'collect',
    'getEnd':'getEnd'
}

const RF = class extends WorkerBase{

    constructor(maxSegLength, minGapLength) {
        super(maxSegLength, minGapLength);
        this.parserData = [];
        this.parserState = pState.start;
        this.devData = {};

    }

    initDriver(options,memories){
        if(!this.port){
            let option = {
                baudRate: options.baudRate || 9600,
                autoOpen: false
            };
            this.port = new SerialPort(options.address || '/dev/ttyUSB0',option );
            this.port.on('data',(data)=>{

            });
        }
    }

    parserData(data){
        switch (this.parserState){
            case pState.start:
                if(data=='fd'){
                    this.parserState = pState.collect;
                }
                break;

            case pState.collect:
                if(this.parserData.length==5){
                    this.parserState = pState.getEnd;
                }
                else {
                    this.parserState.push(data);
                }
                break;
            case pState.getEnd:
                if(data=='fd'){
                    if()
                    this.emit('RegRead',{devId:devId ,memories:this.autoReadMaps[devId]});
                    this.parserState = pState.start;
                    this.parserData = [];
                }
                break;
            default:
                this.parserState = pState.start;
                this.parserData = [];
                break;

        }
    }

    ReadWI (wi_mapItem,devId){
        let result = [];
        let dev = this.devData(devId);
        for(var i = wq_mapItem.start; i <= wq_mapItem.end;i++){
            result.push(dev[i]);
        }
        return result;
    };

    WriteWI (wi_mapItem,devId){
        let result = [];
        let dev = this.devData(devId);
        for(var i = wq_mapItem.start; i <= wq_mapItem.end;i++){
            result.push(dev[i]);
        }
        return result;
    };
}