const SerialPort = require('serialport');
const _ = require('lodash');

const WorkerBase = require('yeedriver-base/WorkerBase');
const InfinitLoop = require('yeedriver-base/InfinitLoop');

const devDefine = require('./devDefine');

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
        this.loopSpan = this.loopSpan || options.loopSpan || 1000;
        this.sids = _.cloneDeep(options.sids || {});
        this.idLength = options.idLength || 20;
        _.each(this.sids,(option,sid)=>{
            let dev = this.devData[sid] || {};
            let define = devDefine[option.uniqueId];
            _.each(define,(iq,key)=>{
                if(key!='code'){
                    dev[key] = dev[key] || {};
                    _.each(iq,(item,add)=>{
                        dev[key][add] = {
                            value:item.defaultValue,
                            time:new Date()
                        };
                    })
                }
            });
            this.devData[sid] = dev;

        });
        if(this.connect){
            clearTimeout(this.connect);
        }
        if(this.port){
            this.port.close();
            this.setRunningState(this.RUNNING_STATE.CONNECTING);
            this.port = null;
        }

        let option = {
            baudRate: options.baudRate || 9600,
            autoOpen: false
        };
        this.port = new SerialPort(options.address || '/dev/ttyUSB0',option );
        this.port.on('data',(data)=>{
            _.each(data,this.parserRf.bind(this));

        });
        this.port.open((err)=>{
            if(!err){
                this.setRunningState(this.RUNNING_STATE.CONNECTED);
                this.setupEvent();
                _.each(this.devData,(data,devId)=>{
                    this.emit('RegRead',{devId:devId ,memories:this.autoReadMaps[devId]});
                })

                if(!this.loopRun){
                    this.loopRun = new InfinitLoop();
                    this.loopRun.addRoutine(this.refresh.bind(this),this.loopSpan);
                }
            }
            else{
                this.setRunningState(this.RUNNING_STATE.CONNECTING);
                this.connect = setTimeout(this.initDriver.bind(this,options,memories),5000)
            }
        })


    }

    refresh(){
        _.each(this.sids,(option,devId)=>{
            let define = devDefine[option.uniqueId];
            _.each(this.devData[devId],(typeData,bwType)=>{
                let typeDefine = define[bwType] || {};
                _.each(typeData,(tar,no)=>{
                    let noDefine = typeDefine[no] || {};
                    let type = noDefine.type || 'E';
                    let defaultValue = noDefine.defaultValue;//_.isUnDefined(noDefine.defaultValue)? false || noDefine.defaultValue;
                    let time = new Date();
                    let timeSpan = time.getTime() - tar.time.getTime();
                    if(type == 'E' && tar.value != defaultValue && timeSpan > this.loopSpan){
                        this.devData[devId][bwType][no] = {
                            value:defaultValue,
                            time:time
                        }
                        this.emit('RegRead',{devId:devId ,memories:this.autoReadMaps[devId]});
                    }
                })
            })
        })
        _.each(this.devData,(data,devId)=>{
            if(!this.sids[devId]){
                delete this.devData[devId];
            }
        });
    }

    parserRf(data){
        // console.log(data.toString(16))
        switch (this.parserState){
            case pState.start:
                if(data.toString(16)=='fd'){
                    this.parserState = pState.collect;
                }
                break;

            case pState.collect:
                if(this.parserData.length==3){
                    this.parserState = pState.getEnd;
                }
                else {
                    this.parserData.push(data);
                }
                break;
            case pState.getEnd:
                if(data.toString(16)=='df'){
                    let dataString = '';
                    _.each(this.parserData,(item)=>{
                       dataString += ("00"+item.toString(16)).substr(-2);
                    });
                    let devId = dataString.substr(0,(this.idLength/4));
                    if(this.sids[devId]){
                        let code = parseInt(dataString.substring((this.idLength/4)),16);
                        let define = devDefine[this.sids[devId].uniqueId] || {};
                        let codeDefine = (define.code && define.code[code]) || {};
                        this.devData[devId] = this.devData[devId] || {};
                        let type = codeDefine.type||"BI";
                        let no = codeDefine.no||0;
                        this.devData[devId][type] = this.devData[devId][type] || {};

                        let defaultValue = define[type]&& define[type][no] && define[type][no].defaultValue;

                        let setValue = undefined;

                        if(_.isBoolean(defaultValue))   {
                            setValue = !defaultValue;
                        }

                        let oldValue = this.devData[devId][type][no].value;

                        this.devData[devId][type][no] = {
                            value:_.isUndefined(codeDefine.value)?setValue:codeDefine.value,
                            time:new Date()
                        }
                        if(this.devData[devId][type][no].value != oldValue){
                            this.emit('RegRead',{devId:devId ,memories:this.autoReadMaps[devId]});
                        }
                    }

                }
                this.parserState = pState.start;
                this.parserData = [];
                break;
            default:
                this.parserState = pState.start;
                this.parserData = [];
                break;

        }
    }

    readTypeData(type,mapItem,devId){
        let result = [];
        let dev = this.devData[devId] || {};
        for(var i = mapItem.start; i <= mapItem.end;i++){
            let value = dev[type] && dev[type][i] && dev[type][i].value;
            result.push(value);
        }
        return result;
    }

    ReadBI(bi_mapItem,devId){
        return this.readTypeData("BI",bi_mapItem,devId)
    };

    ReadBQ(bq_mapItem,devId){
        return this.readTypeData("BQ",bq_mapItem,devId)
    };

    ReadWI(wi_mapItem,devId){
        return this.readTypeData("WI",wi_mapItem,devId)
    };

    ReadWQ(wq_mapItem,devId){
        return this.readTypeData("WQ",wq_mapItem,devId)
    };

    WriteBI (mapItem,value,devId){

        let result = [];
        let dev = this.devData(devId);
        for(var i = wq_mapItem.start; i <= wq_mapItem.end;i++){
            result.push(dev[i]);
        }
        return result;
    };
}

new RF();