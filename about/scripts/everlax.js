//////////////////////////////////////////////////////////////////////////////////////
//                                                                                  //
//                                  Everlax                                         //
//----------------------------------------------------------------------------------//
// created by:  Mark Nelson                                                         //
// version:     1.0                                                                 //
// download:    https://github.com/DataDink/Everlax                                 //
// site:        http://datadink.github.io/Everlax/                                  //
// docs:        https://github.com/DataDink/Everlax/wiki                            //
//                                                                                  //
//////////////////////////////////////////////////////////////////////////////////////

// Polyfills - potentially missing javascript functionality
if (!String.prototype.endsWith) {
    String.prototype.endsWith = function(suffix) {
        return !suffix || this.indexOf(suffix, this.length - suffix.length) !== -1;
    };
}

if (!String.prototype.trim) {
    String.prototype.trim = function() {
        return this.replace(/$\s+|\s+^/gi, '');
    }
}

// Plugin
// -- Functional Overview:
//       * Gather all background image URLs, background-position values, and background-size values
//       * 'Load' each image in order to determine size.
//       * Upon image-load, calculate start and end positions for each background image.
// -- Calculation Overview:
//       * Based on height, width, and angle (a square at 45 degress will travel at approx 45 degrees - rectangle will not)
//       * Adjust final end points to the closest "repeat" point. (This will likely alter the actual direction a small amount)
(function ($) {
    var styleSheet = $('<style type="text/css" />').appendTo('head')[0].sheet;
    var defaultCoords = '0px 0px';
    var defaultConfig = {
        duration: '10s',
        direction: '0',
    }

    $.fn.everlax = function (configuration) {
        configuration = configuration || {};
        return $(this).each(function () {
            var element = $(this);
            
            var images = getBgImages(element);
            if (!images) { return; }
            // { x, y, itterations }
            var direction = calculateDirectionVector(parseIntOrDefault(configuration.direction || element.attr('data-everlax-direction') || defaultConfig.direction));
            // '\d+(s|ms)'
            var duration = calculateDuration((configuration.duration || element.attr('data-everlax-duration') || defaultConfig.duration).trim(), direction.itterations);
            
            var startPoints = [];
            var destinations = [];
            while (startPoints.length < images.length) { 
                startPoints.push('');
                destinations.push('');
            }
            
            
            for (var i = 0; i < images.length; i++) {
                // As each image finishes loading, complete calculations based on height/width.
                // tryStartAnimation will succeed once all calculations have completed.
                loadImage(images[i], i, function (image, index) {
                    if (!image) {
                        destinations[index] = defaultCoords;
                        tryStartAnimation(element, startPoints, destinations, duration);
                        return;
                    }
                    
                    // calculate final size
                    var styleSize = getBgSize(element, index);
                    var imageSize = { width: image.width, height: image.height };
                    var containerSize = { width: element.width(), height: element.height() };
                    size = calcSize(styleSize, imageSize, containerSize);

                    // calculate final start point
                    var stylePosition = getBgPosition(element, index);
                    var start = calcPosition(stylePosition, size, containerSize);
                    startPoints[index] = start.x + 'px ' + start.y + 'px';

                    // calculate final destination point
                    var destX = Math.floor(direction.x * size.width * direction.itterations);
					var targetX = direction.x < 0 ? -size.width : size.width;
                    var adjustMajor = getNormalizer(destX, targetX);
                    destX += adjustMajor + start.x;
                    var destY = Math.floor(direction.y * size.height * direction.itterations);
					var targetY = direction.y < 0 ? -size.height : size.height;
                    adjustMajor = getNormalizer(destY, targetY);
                    destY += adjustMajor + start.y;
                    destinations[index] = destX + 'px ' + destY + 'px';
                    
                    // if all images have finished loading / calculating - this will start the animation.
                    tryStartAnimation(element, startPoints, destinations, duration);
                });
            }
        });
    }
    
    function getBgImages(element) {
        var imageSources = (element.css('background-image') || '').replace(/(?:.*?url\s*\(\s*['"]?)([^'"\)]+)/gi, '$1,').split(',');
        imageSources.pop(); // If there are no images then return
        if (imageSources.length === 1 && !imageSources[0].trim() || imageSources.length === 0) { return null; }
        return imageSources;
    }
    
    function getBgSize(element, index) {
        var styles = (element.css('background-size') || '').trim().split(',');
        if (styles.length <= index) { return 'auto auto'; }
        var parts = (styles[index] || '').trim().split(' ');
        while (parts.length < 2) { parts.push('auto'); }
        var left = normalizeUnit(parts[0]), right = normalizeUnit(parts[1]);
        return left + ' ' + right;
    }
    
    function getBgPosition(element, index) {
        var positions = (element.css('background-position') || '').trim().split(',');
        if (positions.length <= index) { return '0px 0px'; }
        var parts = (positions[index] || '').trim().split(' ');
        while (parts.length < 2) { parts.push('0px'); }
        var swap = parts[0].trim() == 'top' || parts[0].trim() == 'bottom' || parts[1].trim() == 'left' || parts[1].trim() == 'right';
        var left = normalizeUnit(swap ? parts[1] : parts[0]);
        var right = normalizeUnit(right = swap ? parts[0] : parts[1]);
        return left + ' ' + right;
    }

    var styleIndex = 1;
    function tryStartAnimation(element, startPoints, destinations, duration) {
        // Once all destination points have been calculated, create the animation
        for (var i = 0; i < destinations.length; i++) {
            if (!destinations[i]) { return; }
        }

        var ruleName = 'everlax' + (styleIndex++);
        var ruleBody = 'keyframes ' + ruleName
            + ' { 0% { background-position: ' + startPoints.join() + '; }'
            + ' 100% { background-position: ' + destinations.join() + '; } }';
        prefixVendor(function (vendor) { styleSheet.insertRule('@' + vendor + ruleBody, 0); });

        var styleBody = '.' + ruleName + ' {';
        prefixVendor(function(vendor) { styleBody += vendor + 'animation: ' + ruleName + ' ' + duration + ' infinite linear' + '; '; });
        styleBody += ' }';
        styleSheet.insertRule(styleBody, 0);
        
        element.addClass(ruleName);
    }
    
    function prefixVendor(callback) {
        try { callback('-webkit-'); } catch(ex) { }
        try { callback('-khtml-'); } catch(ex) { }
        try { callback('-moz-'); } catch(ex) { }
        try { callback('-ms-'); } catch(ex) { }
        try { callback('-o-'); } catch(ex) { }
        try { callback(''); } catch(ex) { }
    }
    
    function calculateDuration(duration, itterations) {
        // parse duration and multiply by itterations.
        var durationUnit = (/m?s$/i).exec(duration);
        if (durationUnit.length === 0) { throw "everlax: invalid duration unit"; }
        durationUnit = durationUnit[0];
        duration = (parseFloatOrDefault(duration) * itterations) + durationUnit;
        return duration
    }
    
    function calculateDirectionVector(direction) {
        // create a vector of up to one width and one height in the direction specified in angles.
        // determine the number of times either X or Y will have to itterate for the other to reach about 1
        var radians = Math.PI/180*direction;
        var plotx = round(Math.cos(radians));
        var ploty = round(Math.sin(radians));
        var adjustMinor = Math.min(1 - Math.abs(plotx), 1 - Math.abs(ploty)); // adjust to be full width or height
        plotx += plotx < 0 ? -adjustMinor : adjustMinor; // <=1 && >=-1 : To be multiplied by width later
        ploty += ploty < 0 ? -adjustMinor : adjustMinor; // <=1 && >=-1 : To be multiplied by height later
        
        var itterations = Math.floor(1 / Math.min(Math.abs(plotx), Math.abs(ploty)));
        var isInfinite = itterations == Number.POSITIVE_INFINITY || itterations == Number.NEGATIVE_INFINITY;
        if (isInfinite) { itterations = 1; }

        return {
            x: plotx,
            y: ploty,
            itterations: itterations
        }
    }

    function loadImage(source, context, callback) {
        // Attempt to load an image, invoke callback on complete or error
        var image = new Image();
        image.onload = function () { callback(this, context); }
        image.onerror = function () { callback(null, context); }
        image.src = source;
    }
    
    function calcSize(style, actual, container) {
        // supports 'px', '%', and 'auto'
        // todo: add 'em' support to this function
        var parts = (style || '').split(' ');
        var left = parts[0], right = parts[1];
        if (left == 'auto' && right == 'auto') { return actual; }
        if (left == 'auto') {
            var height = calcUnit(right, actual.height, container.height);
            var scale = height / actual.height;
            var width = actual.width * scale;
            return { width: width, height: height };
        }
        if (right == 'auto') {
            var width = calcUnit(left, actual.width, container.width);
            var scale = width / actual.width;
            var height = actual.height * scale;
            return { width: width, height: height };
        }
        var width = calcUnit(left);
        var height = calcUnit(right);
        return { width: width, height: height };
    }
    
    function calcPosition(style, size, container) {
        var parts = (style || '').split(' ');
        var left = parts[0], right = parts[1];
        return {
            x: calcUnit(left, size.width, container.width - size.width),
            y: calcUnit(right, size.height, container.height - size.height)
        }
    }    
    
    function normalizeUnit(unit) {
        unit = (unit || '').trim();
        if (!unit) { return '0px'; }
        if (unit == 'left' || unit == 'top') { return '0%'; }
        if (unit == 'right' || unit == 'bottom') { return '100%'; }
        return unit;
    }

    function calcUnit(unit, length, containerLength) {
        // calculate a real value from a unit value
        unit = (unit || '').trim();
        var unitValue = 0;
        try { unitValue = parseInt(unit); } catch (ex) {};

        var value = 0;
        if (unit.endsWith('px')) { value = unitValue; }
        else if (unit.endsWith('%')) { value = containerLength * (unitValue / 100); }
        else if (unit == 'center') { value = containerLength / 2 - length / 2; }
        return Math.floor(value);
    }

    function parseIntOrDefault(value, defaultValue) {
        try { return parseInt(value.toString().trim()); } catch (ex) { return defaultValue || 0; }
    }

    function parseFloatOrDefault(value, defaultValue) {
        try { return parseFloat(value.toString().trim()); } catch (ex) { return defaultValue || 0; }
    }

    function round(number) {
        return Math.round(number * 10000) / 10000;
    }

    function getNormalizer(number, target) {
        // gets a value required to reach the nearest even multiple of target
        var value = target - Math.abs(number) % Math.abs(target);
        value = number < 0 ? -Math.abs(value) : Math.abs(value);
        return value == target ? 0 : value;
    }
})(jQuery);

