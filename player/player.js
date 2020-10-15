/*
TODO:
    remove ids from controls so that multiple videos can be loaded with working controls {double check to ensure this is done}
    look into BufferStallErrors (more likely Akamai related)
    set DVR slider off with text as "Live" if duration is <= 30 seconds (number may need to be tested)
    work on compatibility wtih Firefox, IE, and Safari
    Fix for "The provided double value is non-finite" on scrub timeline
*/

// create enclosed code to prevent collision with other js code
(function () {
const config = {
          autoStartLoad: true, // (default true)
  	      startPosition : -1, // start at live point (default -1)
          capLevelToPlayerSize: false, // limits renditions based on max frame size (false default)
          debug: false, // set to debug mode (default false)
          initialLiveManifestSize: 1, // number of segments needed to start playback for live (default 1)
              maxBufferHole: 2, // 'Maximum' inter-fragment buffer hole tolerance that hls.js can cope with when searching for the next fragment to load. When switching between quality level, fragments might not be perfectly aligned. This could result in small overlapping or hole in media buffer. This tolerance factor helps cope with this. (default: 0.5 seconds)
          maxSeekHole: 2, // In case playback is stalled, and a buffered range is available upfront, less than maxSeekHole seconds from current media position, hls.js will jump over this buffer hole to reach the beginning of this following buffered range. maxSeekHole allows to configure this jumpable threshold. (default: 2 seconds)
          liveSyncDurationCount: 3, // how many segments back to start from Live (default 3) (for some content may need to set much higher 30)
          startLevel: undefined, // override start level (rendition) for starting
          startFragPrefetch: false, // Start prefetching start fragment although media not attached yet. (default: false)
          enableWebVTT: true, // enable VTT captions if available
          enableCEA708Captions: true, // enable embedded captions if available (seems its pulling in 608 however)
          minAutoBitrate: 0, // Return the capping/min bandwidth value that could be used by automatic level selection algorithm. Useful when browser or tab of the browser is not in the focus and bandwidth drops
          forceKeyFrameOnDiscontinuity: true, // force keyframe when detect scte35 marker?????
    };

function createDependencies() { // function created so that it can be moved if necessary
    // TODO: check if already loaded (not needed to load multiple times if multiple players are used)
    const buttoncss = document.createElement("link");
    buttoncss.setAttribute("rel", "stylesheet");
    buttoncss.setAttribute("type", "text/css");
    buttoncss.setAttribute("href", "//maxcdn.bootstrapcdn.com/font-awesome/4.3.0/css/font-awesome.min.css");
    document.getElementsByTagName("head")[0].appendChild(buttoncss);
    const fontcss = document.createElement("link");
    fontcss.setAttribute("rel", "stylesheet");
    fontcss.setAttribute("type", "text/css");
    fontcss.setAttribute("href", "//fonts.googleapis.com/css?family=Source+Sans+Pro");
    document.getElementsByTagName("head")[0].appendChild(fontcss);
    const playercss = document.createElement("link");
    playercss.setAttribute("rel", "stylesheet");
    playercss.setAttribute("type", "text/css");
    playercss.setAttribute("href", "player/player.css?v=2");
    document.getElementsByTagName("head")[0].appendChild(playercss);
    // document.write('<script src="http://cdn.jsdelivr.net/npm/hls.js@latest" type="text/javascript"></script>');
    // Doesn't work. seems to want to load after the Hls object is required.
    // let hlsjsscript = document.createElement('script');
    // hlsjsscript.setAttribute("type","text/javascript");
    // hlsjsscript.setAttribute("rel","subresource");
    // hlsjsscript.setAttribute("src", "//cdn.jsdelivr.net/npm/hls.js@latest");
    // document.getElementsByTagName("head")[0].appendChild(hlsjsscript);
} createDependencies(); // create on load

function hlsvideo(v) {
    const video = document.getElementById(v);
    const autoParentDiv = document.getElementById("external_buttons"); // TODO: remove when stats not needed
    const debug_mode = true; // this is internal debugger  operations

    // Create Controlbar and insert it before the video element
    video.insertAdjacentHTML('afterend',
        `<div class="player-settings">
            <div class="container"><h3>Captions</h3><ul class="caption-listing"></ul></div>
            <div class="container"><h3>Quality</h3><ul class="quality-listing"></ul></div>
            <!--<div class="container"><h3>Audio Track</h3><ul class="quality-listing"></ul></div>-->
        </div>
        <div class="controlbar">
            <input type="range" min="0" max="100" step="1" value="0" class="dvr" list="dl" />
            <a href="#" class="left fa fa-play play-pause"></a>
            <a href="#" class="left fa fa-volume-up sound" aria-hidden="true"></a>
            <input type="range" min="0" max="100" step="1" orient="vertical" class="left volume vol-control hide" />
            <a href="#" class="right fa fa-arrows-alt fullscreen"></a>
            <a href="#" class="right fa fa-cogs quality"></a>
            <!--<a href="#" class="right fa fa-cc cc" aria-hidden="true"></a>-->
            <!--<a href="#" class="right fa fa-volume-up sound" aria-hidden="true"></a>-->
            <!--<a href="#" class="middle"><img src="/player/img/mlg-logo-loop.gif" /></a>-->
        </div>
        <div class="large-toggle fa-play"></div>`
    );

    // div elements
    const player_div = document.getElementById(video.id).parentNode;
    // quality switcher panel
    const playersettings_div = player_div.getElementsByClassName('player-settings')[0];
    const ccsettings_listing = playersettings_div.getElementsByClassName('caption-listing')[0];
    const qsettings_listing = playersettings_div.getElementsByClassName('quality-listing')[0];

    // control elements
    const controlbar = player_div.getElementsByClassName('controlbar')[0];
    const pauseplay_btn = player_div.getElementsByClassName("play-pause")[0];
    const large_toggle_btn = player_div.getElementsByClassName("large-toggle")[0];
    const quality_btn = player_div.getElementsByClassName("quality")[0];
    const cc_btn = player_div.getElementsByClassName("cc")[0];
    const sound_btn = player_div.getElementsByClassName("sound")[0];
    const fullscreen_btn = player_div.getElementsByClassName("fullscreen")[0];
    const dvr_slider = player_div.getElementsByClassName("dvr")[0];
    const volume_slider = player_div.getElementsByClassName('vol-control')[0];

    var playlist_duration = 10800;
    var marker = 0;
    var last_epoch = 0;

    if(Hls.isSupported()) {

        var hls = new Hls(config);

        var track_src = video.getAttribute('src');
        var url_src = '';
        if(debug_mode){ // play urls passed in via url parameters '?s=' ONLY ALLOWED WHEN DEBUG MODE IS ACTIVE
            var urlParams = new URLSearchParams(window.location.search);
            url_src = urlParams.get('s');
            if(url_src && url_src.includes('.m3u8')){
                // alert(url_src);
            } else {
                url_src = track_src;
            }
        } else {
            url_src = track_src;
        }

        hls.loadSource(url_src);
        hls.attachMedia(video); // uncomment if issues arise loading media -> currently set to load on play button click

        var currentTC = '';
        var timeOffset = '';

        // fired when manifest is first parsed
        hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
            console.log("MANIFEST_PARSED", data);
            console.log('HLS Events: ',Hls.Events); // log possible events
            console.log('LEVELS: ', data.levels); // log level / rendition details
            console.log('TRACKS: ', video.textTracks); // log caption and subtitle tracks
        });

        // Fired when SCTE35 is found in upcoming fragments (preparatory)
        // TODO: loop through all tagList items (see below)
        hls.on(Hls.Events.FRAG_PARSING_DATA, (event, data) => {
            console.log("FRAG_PARSING_DATA", data);
            data.frag.tagList.forEach((tag, index)=>{
                tag.forEach((label, index)=>{
                    if(label.includes('EXT-X-CUE-OUT') || label.includes('EXT-X-CUE-IN')){
                        console.log('==> SCTE EVENT UPCOMING');
                    }
                });
            });
        });

        // Fired when SCTE35 is detected (fired at right time)
        // TODO: test on live stream configuration
        hls.on(Hls.Events.FRAG_CHANGED, (event, data)=> {
            console.log(`FRAG_CHANGED`, data);
            for(var i = 0, len = data.frag.tagList.length; i < len; i++){
                if(data.frag.tagList[i][0] === 'EXT-X-CUE' && !data.frag.tagList[i][1].includes('DURATION="0.000"') || data.frag.tagList[i][0] === 'EXT-OATCLS-SCTE35'){
                    console.log(`>>>>>>>>>>>>>>>>> CUE SPLICE START \n${data.frag.tagList[i][0]} - ${data.frag.tagList[i][1]}\nfrag duration: ${data.frag.duration}\nsn: ${data.frag.sn}\nstartPTS: ${data.frag.startPTS}`);
                } else if (data.frag.tagList[i][0] === 'EXT-X-CUE' && data.frag.tagList[i][1].includes('DURATION="0.000"') || data.frag.tagList[i][0] === 'EXT-X-CUE-IN') {
                    console.log(`<<<<<<<<<<<<<<<<< CUE SPLICE END \n${data.frag.tagList[i][0]} - ${data.frag.tagList[i][1]}\nfrag duration: ${data.frag.duration}\nsn: ${data.frag.sn}`);
                }
            }

            // Used for Program Date Tracking for VOD clipping.
            // - Log Program Time each frag, Also log the current video time when frag changes.
            // - then on pause, log the exact and time subtrack the offset time logged here.
            // - That gives you the time to add to Program Date Time for clipping
            // currentTC = new Date(data.frag.rawProgramDateTime); // converts raw ISO time to date (default is long string)
            // var epoch = currentTC.getTime();
            // console.log(`PROGRAM-DATE-TIME: ${data.frag.rawProgramDateTime}\nepoch: ${epoch}\nvideo.currentTime: ${video.currentTime}\nfrag duration: ${data.frag.duration}\nsn: ${data.frag.sn}`);
            // timeOffset = video.currentTime;
        });

        // collect ID3 data
        hls.on(Hls.Events.FRAG_PARSING_METADATA, function(event, data){
            console.log('FRAG_PARSING_METADATA', data); // data.samples[0].data
            var decodedID3 = new TextDecoder("utf-8").decode(data.samples[0].data);
            decodedID3 = decodedID3.replace(/[\uFFFD|\u0001]/g, '|');
             console.log(`${decodedID3}\nsegment duration: ${data.frag.duration}\nsn: ${data.frag.sn}\nwill trigger at: ${data.frag.startPTS}`);
             marker = data.frag.startPTS;
             console.log(`MARKER!!!!!!!!!!! ${marker}`);
        });

        // collect ID3 data
        hls.on(Hls.Events.FRAG_LOADED_METADATA, function(event, data){
            console.log('FRAG_LOADED_METADATA', data); // data.samples[0].data
            var decodedID3 = new TextDecoder("utf-8").decode(data.samples[0].data);
            decodedID3 = decodedID3.replace(/[\uFFFD|\u0001]/g, '|');
            console.log(decodedID3);
        });

        // collect ID3 data
        hls.on(Hls.Events.FRAG_PARSING_USERDATA, function(event, data){
            console.log('FRAG_PARSING_USERDATA', data);
        });

        // Log each level switch activity
        hls.on(Hls.Events.LEVEL_SWITCHED, (event, data) => {
            console.log("LEVEL_SWITCHED =>", data);
            console.log('Current Level: ',qualityLevels[hls.currentLevel]);
        });

        // Log each fragment as they preload
        hls.on(Hls.Events.FRAG_LOADED, (event, data) => {
            console.log("FRAG_LOADED", data);
            var raw_epoch = new Date(data.frag.programDateTime);
            last_epoch = raw_epoch.getTime();
            // console.log(`last_epoch: ${last_epoch}`);
        });

        hls.on(Hls.Events.LEVEL_SWITCHING,function(event,data) {
           console.log('LEVEL_SWITCHING', data);
           if(playState == 1){ // not sure if this helps
               video.play();
           }
           // hls.startLoad();
        });

        // log errors
        hls.on(Hls.Events.ERROR, (event, data) => {
            console.log("ERROR =>");
            console.log(data);
            if (data.fatal) {
                switch(data.type) {
                    case Hls.ErrorTypes.NETWORK_ERROR:
                        // try to recover network error
                        console.log("fatal network error encountered, try to recover");
                        hls.startLoad();
                        if(playState == 1){
                            video.play();
                        }
                        break;
                    case Hls.ErrorTypes.MEDIA_ERROR:
                        console.log("fatal media error encountered, try to recover");
                        hls.recoverMediaError();
                        if(playState == 1){
                            video.play();
                        }
                        break;
                    case Hls.ErrorTypes.MANIFEST_LOAD_TIMEOUT:
                        console.log("timeout while loading manifest");
                        break;
                    case Hls.ErrorTypes.MANIFEST_PARSING_ERROR:
                        console.log("error while parsing manifest:" + data.reason);
                        break;
                    case Hls.ErrorTypes.LEVEL_LOAD_ERROR:
                        console.log("error while loading level playlist");
                        break;
                    case Hls.ErrorTypes.LEVEL_LOAD_TIMEOUT:
                        console.log("timeout while loading level playlist");
                        break;
                    case Hls.ErrorTypes.LEVEL_SWITCH_ERROR:
                        console.log("error while trying to switch to level " + data.level);
                        break;
                    case Hls.ErrorTypes.FRAG_LOAD_ERROR:
                        console.log("error while loading fragment " + data.frag.url);
                        break;
                    case Hls.ErrorTypes.FRAG_LOAD_TIMEOUT:
                        console.log("timeout while loading fragment " + data.frag.url);
                        break;
                    case Hls.ErrorTypes.FRAG_LOOP_LOADING_ERROR:
                        console.log("Frag Loop Loading Error");
                        break;
                    case Hls.ErrorTypes.FRAG_DECRYPT_ERROR:
                        console.log("Decrypting Error:" + data.reason);
                        break;
                    case Hls.ErrorTypes.FRAG_PARSING_ERROR:
                        console.log("Parsing Error:" + data.reason);
                        break;
                    case Hls.ErrorTypes.KEY_LOAD_ERROR:
                        console.log("error while loading key " + data.frag.decryptdata.uri);
                        break;
                    case Hls.ErrorTypes.KEY_LOAD_TIMEOUT:
                        console.log("timeout while loading key " + data.frag.decryptdata.uri);
                        break;
                    case Hls.ErrorTypes.BUFFER_APPEND_ERROR:
                        console.log("Buffer Append Error");
                        break;
                    case Hls.ErrorTypes.BUFFER_ADD_CODEC_ERROR:
                        console.log("Buffer Add Codec Error for " + data.mimeType + ":" + data.err.message);
                        break;
                    case Hls.ErrorTypes.BUFFER_APPENDING_ERROR:
                        console.log("Buffer Appending Error");
                        break;
                    default:
                        // cannot recover
                        console.log('this is beyond repair. EJECT!');
                        hls.destroy();
                        break;
                }
            } else {
                console.log("non-fatal media error encountered, try to recover");
                console.log(`playstate: ${playState}`);
                // hls.recoverMediaError();
                hls.startLoad();
                if(playState === 1){
                    console.log(`this should fire`);
                    video.play();
                }
            }

        });

    }

    //Create MSE objects
    var qualityLevels;
    video.addEventListener('loadedmetadata', () => {
        dvr_slider.setAttribute("max", video.duration); // set max attribute for dvr slider
        // console.log('video duration: '+video.duration);
        // console.log("currentLevel => "+hls.currentLevel); // -1 means auto
        playlist_duration = video.duration; // gets init video duration to control live dvr slider
        // quality switch panel
        qualityLevels = hls.levels; // HLS Quality Levels
        // buttons for each quality level
        let btn_index = 0;
        // create auto or default buttons
        let autoLI = document.createElement("li");
        autoLI.innerHTML = `<a href="#" data-quality-options="-1" class="quality-item">auto</a>`;
        qsettings_listing.appendChild(autoLI);
        autoLI.addEventListener('click', (e) => {
            hls.currentLevel = -1; // -1 will set level to auto
            console.log(`setting quality level to: AUTO`);
            let qualityItemContainer = e.target.parentNode.parentNode;
            let qualityItems = qualityItemContainer.getElementsByTagName('li');
            for (var i = 0; i < qualityItems.length; i++) { // remove selected clas from other items before setting the new level as selected
                qualityItems[i].getElementsByClassName('quality-item')[0].classList.remove('selected');
            }
            quality_btn.classList.remove('selected'); // remove highlighting as the quality level is no longer forced
            //TODO: also remove any selected renditions - see below
            playersettings_div.classList.remove('show'); // TODO:  get parent then child of class
            qualityState = 0;
        });
        for (let value of qualityLevels) {
            let qtext;
            let qbtn = document.createElement("div"); // TODO: convert to UL LI
            if (typeof value.name != 'undefined'){
                qtext = value.name;
            } else {
                var bitrate_text_calc = value.bitrate / 1000;
                qtext = `${bitrate_text_calc} kbps`;
            }
            let currLI = document.createElement("li");
            currLI.innerHTML = `<a href="#" data-quality-options="${btn_index}" class="quality-item">${qtext}</a>`;
            qsettings_listing.appendChild(currLI);
            currLI.addEventListener('click', (e) => {
                hls.nextLevel = parseInt(e.target.getAttribute("data-quality-options")); // switching needs to be an int not a str.
                // hls.currentLevel = parseInt(e.target.getAttribute("data-quality-options")); // switching needs to be an int not a str.
                console.log(`current level: ${hls.currentLevel}`);
                console.log(`quality set to: ${e.target.getAttribute("data-quality-options")}`);
                var qualityItemContainer = e.target.parentNode.parentNode;
                var qualityItems = qualityItemContainer.getElementsByTagName('li');
                for (var i = 0; i < qualityItems.length; i++) { // remove selected clas from other items before setting the new level as selected
                    qualityItems[i].getElementsByClassName('quality-item')[0].classList.remove('selected');
                }
                quality_btn.classList.add('selected');
                e.target.classList.add('selected');
                playersettings_div.classList.remove('show'); // TODO:  get parent then child of class
                qualityState = 0;
            });
            btn_index++;
        }
    }); // end loaded metadata

    // Create CC Panel
    video.addEventListener('loadeddata', () => { // CC wont display correctly until all data loaded, so this wont work on loadedmetadata
        let cc_index = 0;
        // create CC Off button
        let ccoffLI = document.createElement("li");
        ccoffLI.innerHTML = `<a href="#" data-cc-options="-1" class="cc-item">CC off</a>`;
        ccsettings_listing.appendChild(ccoffLI);
        ccoffLI.addEventListener('click', (e) => {
            for (let i = 0; i < video.textTracks.length; i++) {
                video.textTracks[i].mode = 'hidden';
            }
            console.log(`setting CC to: OFF`);
            quality_btn.classList.remove('selected'); // remove highlighting as the CC on is no longer forced
            playersettings_div.classList.remove('show'); // TODO:  get parent then child of class
            qualityState = 0;
        });
        for (let track of video.textTracks) {
            let cctext;
            let ccbtn = document.createElement("div"); // TODO: convert to UL LI
            if (typeof track.label != 'undefined' && track.label != ''){
                cctext = track.label;
            } else if (typeof track.language != 'undefined' && track.language != '') {
                cctext = track.language;
            } else {
                cctext = `unlabled ${track.kind} track`;
            }
            let currLI = document.createElement("li");
            currLI.innerHTML = `<a href="#" data-cc-options="${cc_index}" class="cc-item">${cctext}</a>`;
            ccsettings_listing.appendChild(currLI);
            currLI.addEventListener('click', (e) => {
                for (let i = 0; i < video.textTracks.length; i++) {
                    video.textTracks[i].mode = 'hidden'; // turn off any other tracks before setting new one
                }
                let cc_enabledTrack = e.target.getAttribute("data-cc-options");
                video.textTracks[cc_enabledTrack].mode = 'showing';
                console.log(`turning on CC track: ${cc_enabledTrack}`);
                // cc_btn.classList.add('selected');
                playersettings_div.classList.remove('show'); // TODO:  get parent then child of class
                qualityState = 0;
            });
            cc_index++;
        }
    });


    //Play Pause Button toggle and operation
    var playState = 0; // default paused state
    const pauseplay = (e) => {
        e.preventDefault();
        if(playState == 0){
            playState = 1;
            pauseplay_btn.classList.remove('fa-play');
            pauseplay_btn.classList.add('fa-pause');
            large_toggle_btn.classList.remove('large-play');
            large_toggle_btn.classList.add('large-pause');
            video.play();
        } else {
            playState = 0;
            pauseplay_btn.classList.remove('fa-pause');
            pauseplay_btn.classList.add('fa-play');
            large_toggle_btn.classList.remove('large-pause');
            large_toggle_btn.classList.add('large-play');
            video.pause();
            var timeSinceFrag = video.currentTime - timeOffset;
            var to = Math.round(timeSinceFrag);
            var updatedCurrentTC = new Date(currentTC.getTime()+to*1000);
            console.log(`paused currentTC: ${currentTC}\n\npaused timeSinceFrag: ${timeSinceFrag}\n\nupdated currentTC: ${updatedCurrentTC}`);
        }
    }
    pauseplay_btn.addEventListener("click", pauseplay);
    large_toggle_btn.addEventListener("click", pauseplay);


    // //Sound Button toggle and operation
    // var volState = 1; // default sound on
    // sound_btn.addEventListener("click", (e) => {
    //     e.preventDefault();
    //     if(volState == 0){
    //         volState = 1;
    //         e.target.classList.remove('fa-volume-off');
    //         e.target.classList.add('fa-volume-up');
    //         video.muted = false;
    //     } else {
    //         volState = 0;
    //         e.target.classList.remove('fa-volume-up');
    //         e.target.classList.add('fa-volume-off');
    //         video.muted = true;
    //     }
    // });

    //Sound Button toggle and operation
    var volState = 0; // default sound on
    sound_btn.addEventListener("click", (e) => {
        e.preventDefault();
        if(volState == 0){
            volState = 1;
            volume_slider.classList.remove('hide');
            volume_slider.classList.add('show');
        } else {
            volState = 0;
            volume_slider.classList.remove('show');
            volume_slider.classList.add('hide');
        }
    });

    //Quality Button toggle and operation TODO: change quality button to settings button
    var qualityState = 0; // default captions off by default
    quality_btn.addEventListener("click", (e) => {
        e.preventDefault();
        if(qualityState == 0){
            qualityState = 1;
            playersettings_div.classList.add('show'); // TODO:  get parent then child of class
        } else {
            qualityState = 0;
            playersettings_div.classList.remove('show'); // TODO:  get parent then child of class
        }
    });

    // fullscreen button
    fullscreen_btn.addEventListener("click", (e) => {
        if (!player_div.fullscreenElement &&    // alternative standard method
        !document.mozFullScreenElement && !document.webkitFullscreenElement && !document.msFullscreenElement ) {  // current working methods
            if (player_div.requestFullscreen) {
                player_div.requestFullscreen();
            } else if (player_div.msRequestFullscreen) {
                player_div.msRequestFullscreen();
            } else if (player_div.mozRequestFullScreen) {
                player_div.mozRequestFullScreen();
            } else if (player_div.webkitRequestFullscreen) {
                player_div.webkitRequestFullscreen(Element.ALLOW_KEYBOARD_INPUT);
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.msExitFullscreen) {
                document.msExitFullscreen();
            } else if (document.mozCancelFullScreen) {
                document.mozCancelFullScreen();
            } else if (player_div.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            }
        }
    });

    video.addEventListener('durationchange', ()=>{
        // alert(video.duration);
    });

    // For ID3 Detection
    video.textTracks.addEventListener('addtrack', function(addTrackEvent) {
        console.log('ADDED TRACK:',addTrackEvent);
        var track  = addTrackEvent.track;
        track.mode = 'hidden';

        track.addEventListener('cuechange', function(cueChangeEvent) {
            if(cueChangeEvent.target.kind !== 'captions'){
                console.log('metadata:',cueChangeEvent.target);
            }
        });
    });

    // Update the seek bar as the video plays
    video.addEventListener('timeupdate', () => {
        dvr_slider.setAttribute("max", video.duration); // set max attribute for dvr slider
        if(video.duration > playlist_duration){ // may not be necessary as negative mins dont seem to effect Chrome at least
            dvr_slider.setAttribute("min", video.duration-playlist_duration); // set min attribute for dvr slider -> set to seconds of playlist
        } else {
            dvr_slider.setAttribute("min", 0);
        }
        var value = video.currentTime;
        dvr_slider.value = value;

        /* used for ID marker testing */
        // console.log(`----------------------markerupdate------------------\n${marker}`);
        // var x = document.getElementById('x');
        // var min = video.duration-playlist_duration;
        // var max = video.duration;
        // var range = max-min;
        // // var marker = 30;
        // var marker_position = marker-min;
        // var marker_percent = ((marker_position/range)*100)-4;
        // x.style.marginLeft = marker_percent+"%";

        // console.log('video duration: '+video.duration);
        // var str = 'U+313x';
        // var uni_str = '"'+str.replace(/([0-9a-z]{4})/g, '\\u$1')+'"';
        // video.textTracks[0].activeCues[0].text = JSON.parse(uni_str);
        // video.textTracks[0].activeCues[0].text = 'ㅄㅄㅄㅄㅄ';
        // video.textTracks[0].activeCues[1].text = '\ufeff ㅄㅄㅄㅄㅄ';
        // video.textTracks[0].activeCues[2].text = '\ufeff ㅄㅄㅄㅄㅄ';
        // function encode_utf8(s) {
        //     return unescape( encodeURIComponent( s ));
        // }
        // var parseme = encode_utf8(video.textTracks[0].activeCues[0].text);
        // console.log(parseme);

        // console.log("updating text-tracks");
        // console.log(video.textTracks[0].cues[0].track.kind);
    });

    volume_slider.addEventListener('input', (e) => {
        video.volume = e.target.value / 100;
        if(video.volume === 0){
            sound_btn.classList.remove('fa-volume-up');
            sound_btn.classList.add('fa-volume-off');
            video.muted = true;
        } else {
            sound_btn.classList.remove('fa-volume-off');
            sound_btn.classList.add('fa-volume-up');
            video.muted = false;
        }
    });

    dvr_slider.addEventListener('input', (e) => {
        video.currentTime = e.target.value;
    });

    //Test bUtton - not working. jumps to wrong time
    // var testbutton = document.getElementById('testbutton');
    // testbutton.addEventListener("click", (e) => {
    //     var marker_event = 1539119406000; // 2:10pm
    //     var start_epoch = last_epoch-(video.duration*1000);
    //     var marked_time = marker_event-start_epoch;
    //     console.log(`==================================\nmarker_event: ${marker_event}\nlast_epoch: ${last_epoch}\nduration: ${video.duration*1000}\nstart_epoch ${last_epoch}-${video.duration} = ${start_epoch}\nmarked_time: ${marker_event}-${start_epoch} = ${marked_time}`);
    //     video.currentTime = marked_time;
    //     video.play();
    // });

} // end hlsvideo


//create players for each video object
var videos = document.getElementsByTagName('video');
for (var i = 0, len = videos.length; i < len; i++) {
      hlsvideo(videos[i].id);
}

}()); // end closure
