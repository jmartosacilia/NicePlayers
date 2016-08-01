/**
 * Created for NicePeopleAtWork.
 * User: Miquel Fradera
 * User: Luis Miguel Lainez
 * Date: 03/04/14
 * Time: 16:48
 */

//We look for all the elements in the view.
//This is because there is no identifier for the video.
//And it can have the tag "object", so tag video doesn't
//work either.
//If the video is not found, we will looking for it 
var SmartPlugin = { 
    smartAnalytics: null,
    player: null,
    Init: function() {  
       // console.log("In smartPlugin init");
        try{
            var all = document.getElementsByTagName("*");
            var found = false;
            var i=0;
            var element;
            while(i<all.length && !found){
                element = all[i];
                if(element.type != undefined){
                    if( element.type.indexOf("video") == 0){
                        found =true;
                        this.player = element;
                    }
                }
                i++;
            }
        }catch(err){
            console.log(err);
        }
        if(this.player!= null){
            //console.log("Player ID : " + this.player.id); 
             var nice264Plugin = new Nice264Analytics(this.player.id);
        }else{
           // console.log("Player is null");
            try{
                setTimeout(function(){ 
                   // console.log("Repeat init");
                    console.log(SmartPlugin);
                    SmartPlugin.Init(); 
                }, 1000);
            }catch(err){
                //console.log("Error in timeout");
            }
        }
           
       
    }, 
};



var Nice264AnalyticsEvents = {
    BUFFER_BEGIN: 1,
    BUFFER_END: 0
};

var Nice264AnalyticsError = {
    0: {
        id: "FORMAT_NOT_SUPPORTED",
        message: "A/V format not supported"
    },
    1: {
        id: "NETWORK_ERROR",
        message: "Cannot connect to server or connection lost"
    },
    2: {
        id: "UNKNOWN_ERROR",
        message: "Unidentified error"
    },
    1000: {
        id: "FILE_NOT_FOUND",
        message: "File is not found"
    },
    1001: {
        id: "INVALID_PROTOCOL",
        message: "Invalid protocol"
    },
    1002: {
        id: "DRM_FAILURE",
        message: "DRM failure"
    },
    1003: {
        id: "EMPTY_PLAYLIST",
        message: "Playlist is empty"
    },
    1004: {
        id: "INVALID_PLAYLIST",
        message: "Unrecognized playlist"
    },
    1005: {
        id: "INVALID_ASK",
        message: "Invalid ASX format"
    },
    1006: {
        id: "UNRECEIVED_PLAYLIST",
        message: "Error in downloading playlist"
    },
    1007: {
        id: "OUT_OF_MEMORY",
        message: "Out of memory"
    },
    1008: {
        id: "INVALID_URL",
        message: "Invalid url list format"
    },
    1009: {
        id: "NOT_PLAYABLE",
        message: "Not playable in playlist"
    },
    1100: {
        id: "UNKNOWN_DRM_ERROR",
        message: "Unidentified WM-DRM error"
    },
    1101: {
        id: "INVALID_LICENSE",
        message: "Incorrect license in local license store"
    },
    1102: {
        id: "UNRECEIVED_LICENSE",
        message: "Fail in receiving correct license from server"
    },
    1103: {
        id: "EXPIRED_LICENSE",
        message: "Stored license expired"
    }
};

/**
 * Plugin definition.
 * @param playerId
 * @param system
 * @param service
 * @param playInfo
 */
function Nice264Analytics(playerId)
{

    this.oldFunction = null;
    /**
     * Attributes.
     */
    this.playerId = playerId;
    this.system = youboraData.getAccountCode();
    this.service = youboraData.getService();

    // player reference
    this.player = null;
    this.playStateCallback = "";

    // configuration
    this.pluginVersion = "2.0.2_lgtv";
    this.targetDevice = "LG_NetCast";
    this.outputFormat = "xml";
    this.xmlHttp = null;
    this.isXMLReceived = false;

    // events queue
    this.resourcesQueue = [];
    this.eventsQueue = [];
    this.eventsTimer = null;

    // events
    this.isStartEventSent = false;
    this.isJoinEventSent = false;
    this.isStopEventSent = false;
    this.isBufferRunning = false;
    this.isPauseEventSent = false;

    // properties
    this.assetMetadata = {};
    this.isLive = false;
    this.bufferTimeBegin = 0;

    // urls
    this.pamBufferUnderrunUrl = "";
    this.pamJoinTimeUrl = "";
    this.pamStartUrl = "";
    this.pamStopUrl = "";
    this.pamPauseUrl = "";
    this.pamResumeUrl = "";
    this.pamPingUrl = "";
    this.pamErrorUrl = "";

    // code
    this.pamCode = "";
    this.pamCodeOrig = "";
    this.pamCodeCounter = 0;

    // ping
    this.pamPingTime = 0;
    this.lastPingTime = 0;
    this.diffTime = 0;
    this.pingTimer = null;

    this.communications ={};

    /**
     * Initialization.
     */
    this.init();
};

/**
 * Plugin setup.
 */
Nice264Analytics.prototype.init = function()
{
    console.log("Init in the sp")
    var context = this;
    this.player = document.getElementById(this.playerId);
    this.oldFunction = this.player.onPlayStateChange;
    this.player.onPlayStateChange = function(){ context.myCheckPlayState(); context.oldFunction.call(this); };

    try{
        this.communications = new YouboraCommunication(this.system, this.service , youboraData , this.pluginVersion , this.targetDevice);
        this.pamPingTime = this.communications.getPingTime();
    }catch(err){
        console.log(err);
    }
    //If it is playing, send start and join time. Exceptional case for when the plugin is not
    //fast enough.
    try{
        if(this.player.playState == 1){
            //console.log("Start event begin  in init");
            this.start();   
            this.buffer(Nice264AnalyticsEvents.BUFFER_BEGIN) ;
            var self= this;
            setTimeout(function(){ 
                self.buffer(Nice264AnalyticsEvents.BUFFER_END) ;
            }, 1000);

        }
    }catch(err){
        console.log(err);
    }

};

Nice264Analytics.prototype.parseAnalyticsResponse = function(httpEvent)
{
    if (httpEvent.target.readyState == 4)
    {
        var response = httpEvent.target.responseText;
        var d = new Date();

        if (response.length > 0 || response != "" || !typeof(undefined))
        {
            this.pamPingTime = response;
        }

        this.setPing();
        this.lastPingTime = d.getTime();
    }
};

Nice264Analytics.prototype.updateCode = function()
{
    this.pamCodeCounter++;
    this.pamCode = this.pamCodeOrig + "_" + this.pamCodeCounter;
};

Nice264Analytics.prototype.reset = function()
{
    this.isStartEventSent = false;
    this.isJoinEventSent = false;
    this.isBufferRunning = false;
    this.isPauseEventSent = false;
    this.bufferTimeBegin = 0;

    clearTimeout(this.pingTimer);
    this.pingTimer = null;
    this.lastPingTime = 0;
    this.diffTime = 0;

    this.updateCode();
};

/**
 * Plugin methods. Getters and Setters.
 */
Nice264Analytics.prototype.setPlayerStateCallback = function(callback)
{
    this.playStateCallback = callback;
};

Nice264Analytics.prototype.setUsername = function(username)
{
    youboraData.setUsername(username);
};

Nice264Analytics.prototype.setMetadata = function(metadata)
{
    this.assetMetadata = metadata;
};

Nice264Analytics.prototype.getMetadata = function()
{
    var jsonObj = JSON.stringify(this.assetMetadata);
    var metadata = encodeURI(jsonObj);

    return metadata;
};

Nice264Analytics.prototype.setLive = function(value)
{
    this.isLive = value;
};

Nice264Analytics.prototype.setTransactionCode = function(trans)
{
    youboraData.setTransactionCode(trans);
};

Nice264Analytics.prototype.getBitrate = function()
{
    try
    {
        var playInfo = this.player.mediaPlayInfo();
    }
    catch (err)
    {
        return -1;
    }

    //console.log("DRM_TYPE="+$("#"+this.playerId).attr("drm_type"));

    if ($("#"+this.playerId).attr("drm_type") === undefined){
        //for NO DRM
        return playInfo.bitrateTarget;
    } else if ($("#"+this.playerId).attr("drm_type") == "widevine" || $("#"+this.playerId).attr("drm_type") == "wm-drm"){
        //for DRM
        return playInfo.bitrateInstant;
    }
        
    //return playInfo.bitrateInstant;
};

Nice264Analytics.prototype.setPing = function()
{
    var context = this;

    this.pingTimer = setTimeout(function(){ context.ping(); }, this.pamPingTime);
};

/**
 * Plugin events. Analytics.
 */
Nice264Analytics.prototype.start = function()
{
    //console.log("Start event begin in start ");
    var d = new Date();
   /* var params = "?pluginVersion=" + this.pluginVersion +
        "&pingTime=" + this.pamPingTime +
        "&totalBytes=0" +
        "&code=" + this.pamCode +
        "&referer=" + encodeURIComponent(window.location.href) +
        "&user=" + youboraData.getUsername() +
        "&properties=" + this.getMetadata() +
        "&live=" + this.isLive +
        "&transcode=" + youboraData.getTransaction() + 
        "&system=" + this.system +
        "&resource=" + encodeURIComponent(this.player.data);      */
  
    try{
        this.communications.sendStart ("0" , window.location.href , this.getMetadata() , this.isLive , this.player.data , "0" , youboraData.getTransaction());
    }catch(err){
        console.log(err);
    }
    this.isStartEventSent = true;
    this.setPing();
    this.lastPingTime = d.getTime();
    //console.log("Start event sent ");
};

Nice264Analytics.prototype.ping = function()
{
    var d = new Date();

    clearTimeout(this.pingTimer);

    this.communications.sendPingTotalBitrate(this.getBitrate(),this.player.playPosition);

    this.setPing(); 

};

Nice264Analytics.prototype.buffer = function(bufferState)
{
    var d = new Date();
    var bufferTimeEnd = 0;
    var bufferTimeTotal = 0;
    var params = null;

    if (bufferState == Nice264AnalyticsEvents.BUFFER_BEGIN)
    {
        this.bufferTimeBegin = d.getTime();
    }
    else if (bufferState == Nice264AnalyticsEvents.BUFFER_END)
    {
        bufferTimeEnd = d.getTime();
        bufferTimeTotal = bufferTimeEnd - this.bufferTimeBegin;

        if (!this.isJoinEventSent)
        {
            this.isJoinEventSent = true;

            this.communications.sendJoin(this.player.playPosition,bufferTimeTotal);

           // this.sendAnalytics(this.pamJoinTimeUrl, params, false);
        }
        else
        {
            this.communications.sendBuffer( this.player.playPosition , bufferTimeTotal );
        }
    }
};

Nice264Analytics.prototype.resume = function()
{

    this.communications.sendResume();
};

Nice264Analytics.prototype.pause = function()
{
    this.communications.sendPause();
   /* var params = "?code=" + this.pamCode;

    this.sendAnalytics(this.pamPauseUrl, params, false);*/
};

Nice264Analytics.prototype.stop = function()
{

    this.communications.sendStop();
    clearTimeout(this.pingTimer);
    this.pingTimer = null;

    this.reset();
};

Nice264Analytics.prototype.error = function()
{
    var errorMessage =Nice264AnalyticsError[this.player.error].id + ": " + Nice264AnalyticsError[this.player.error].message;

    this.communications.sendError( this.player.error  , errorMessage , youboraData.transaction , encodeURIComponent(this.player.data) , this.system , this.isLive, this.getMetadata(), youboraData.getUsername(), encodeURIComponent(window.location.href), "0", this.pamPingTime , this.pluginVersion, this.duration);

  

    clearTimeout(this.pingTimer);
    this.pingTimer = null;
};

/**
 * Plugin events. Player.
 */
Nice264Analytics.prototype.myCheckPlayState = function()
{
    switch (this.player.playState)
    {
        case 0:     // stopped
            if (!this.isStopEventSent)
            {
                this.isStopEventSent = true;
                this.stop();
            }
            break;
        case 1:     // playing
            if (this.isStopEventSent)
            {
                this.isStopEventSent = false;
            }

            if (!this.isStartEventSent)
            {
                //this.isStartEventSent = true;
                this.start();
            }
            else if (this.isPauseEventSent)
            {
                this.isPauseEventSent = false;
                this.resume();
            }

            if (!this.isJoinEventSent && !this.isBufferRunning)
            {
                this.buffer(Nice264AnalyticsEvents.BUFFER_BEGIN);
                this.buffer(Nice264AnalyticsEvents.BUFFER_END);
            }

            if (this.isBufferRunning)
            {
                this.isBufferRunning = false;
                this.buffer(Nice264AnalyticsEvents.BUFFER_END);
            }
            break;
        case 2:     // paused
            this.isPauseEventSent = true;
            this.pause();
            break;
        case 3:     // connecting
            break;
        case 4:     // buffering
            this.isBufferRunning = true;
            this.buffer(Nice264AnalyticsEvents.BUFFER_BEGIN);
            break;
        case 5:     // finished
            if (!this.isStopEventSent)
            {
                this.isStopEventSent = true;
                this.stop();
            }
            break;
        case 6:     // error
            this.error();
            if (!this.isStopEventSent)
            {
                this.isStopEventSent = true;
                this.stop();
            }
            break;
    }
    
};

// TODO: add events queue logic