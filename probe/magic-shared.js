if (String.prototype.replaceAll === undefined) {
    String.prototype.replaceAll = function (search, replacement, caseInsensitive = false) {
        var target = this;
        // return target.replace(new RegExp(search, 'g'), replacement);
        return target.replace(new RegExp(search.replace(/([\/\,\!\\\^\$\{\}\[\]\(\)\.\*\+\?\|\<\>\-\&])/g, "\\$&"), (caseInsensitive ? "gi" : "g")), (typeof (replacement) == "string") ? replacement.replace(/\$/g, "$$$$") : replacement);
    };
}

if (String.prototype.toAscii === undefined) {
    String.prototype.toAscii = function () {
        return this.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    }
}

var memoize = function (func) {
    var results = {};
    return function (...args) {
        var argsKey = JSON.stringify(args);
        if (!results[argsKey]) {
            results[argsKey] = func(...args);
        }
        return results[argsKey];
    };
};

var sessionID;
var appClientID;
var userPoolID;

var storeCountry = "United States";
var storeTimeZone = "America/Los_Angeles";


var statusMap = {
    awaitingPayment: "Awaiting Payment",
    paymentReceived: "Payment Received",
    processing: "Processing",
    hold: "Hold",
    cancelled: "Cancelled",
    readyForPickup: "Ready For Pickup",
    shipped: "Shipped"
}

var createCaseInsensitiveMap = function (inputObject) {
    const map = {};
    for (const key in inputObject) {
        map[key.toLowerCase()] = inputObject[key];
    }

    return new Proxy(map, {
        get(target, prop) {
            if (typeof prop !== 'string') return undefined;
            return target[prop.toLowerCase()] ?? prop;
        },
        set(target, prop, value) {
            if (typeof prop !== 'string') return false;
            target[prop.toLowerCase()] = value;
            return true;
        },
        deleteProperty(target, prop) {
            if (typeof prop !== 'string') return false;
            return delete target[prop.toLowerCase()];
        }
    });
}

var channelNameMap = {
    pos: "Point of Sale",
    website: "Website",
    tcgplayer: "TCGplayer",
    tcgplayerDirect: "TCGplayer Direct",
    cardtrader: "CardTrader",
    cardTrader: "CardTrader",
    cardTraderZero: "CardTrader Zero",
    ebay: "eBay",
    eBay: "eBay",
    orderRefund: "Refund",
    manapool: "Mana Pool",
    walmart: "Walmart"
}
var buyOrderStatusMap = {
    new: "Requested",
    approved: "Awaiting Receipt",
    pendingTransfer: "Pending Transfer",
    received: "Grading",
    graded: "Graded",
    accepted: "Accepted",
    complete: "Complete",
    cancelled: "Cancelled",
    composing: "Composing"
}

var taxTypeMap = {
    gst: "GST",
    pst: "PST",
    hst: "HST"
}

var paymentTypeMap = {
    interac: "Interac E-Transfer",
    paypal: "PayPal",
    storeCredit: "Store Credit",
    cheque: "Cheque",
    check: "Check",
    cash: "Cash",
    venmo: "Venmo",
    zelle: "Zelle"
}

var languageMap = {
    "English": "EN",
    "Spanish": "ES",
    "French": "FR",
    "German": "DE",
    "Italian": "IT",
    "Portuguese": "PT",
    "Japanese": "JA",
    "Korean": "KO",
    "Russian": "RU",
    "Simplified Chinese": "ZHS",
    "Traditional Chinese": "ZHT",
    "Chinese (S)": "ZHS",
    "Chinese (T)": "ZHT"
}

var getCognitoUser = function () {
    if (userPoolID && appClientID) {
        var userPool = new AmazonCognitoIdentity.CognitoUserPool({
            UserPoolId: userPoolID,
            ClientId: appClientID
        });
        var currentUser = userPool.getCurrentUser();
        return currentUser;
    } else return;

}

generateGUID = (typeof (window.crypto) != 'undefined' &&
    typeof (window.crypto.getRandomValues) != 'undefined') ?
    function () {
        // If we have a cryptographically secure PRNG, use that
        // https://stackoverflow.com/questions/6906916/collisions-when-generating-uuids-in-javascript
        var buf = new Uint16Array(8);
        window.crypto.getRandomValues(buf);
        var S4 = function (num) {
            var ret = num.toString(16);
            while (ret.length < 4) {
                ret = "0" + ret;
            }
            return ret;
        };
        return (S4(buf[0]) + S4(buf[1]) + "-" + S4(buf[2]) + "-" + S4(buf[3]) + "-" + S4(buf[4]) + "-" + S4(buf[5]) + S4(buf[6]) + S4(buf[7]));
    }

    :

    function () {
        // Otherwise, just use Math.random
        // https://stackoverflow.com/questions/105034/how-to-create-a-guid-uuid-in-javascript/2117523#2117523
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    };

var devOverride = false;
var getJSON = function (url, data, callback, callbackData) {
    var origURL = url;
    var serverHost = "api.conductcommerce.com";
    var devServerHost = "dev." + serverHost;
    if (window.location.host.includes("dev.")) {
        serverHost = "dev." + serverHost;
    }
    if (devOverride) serverHost = devServerHost;

    if (data == undefined) data = {};
    url = "https://" + serverHost + "/v1/" + url;
    var isGet = data.isGet;
    reqType = "POST";
    if (isGet) {
        reqType = "GET";
        data.isGet = undefined;
    }

    var doGetJSON = function (url, data, callback, callbackData) {
        var callbackDataVar = callbackData;
        data.reqID = generateGUID();
        var showErrorMessage = true;
        if (data.skipErrorMessage) showErrorMessage = false;
        if (isGet === undefined) {
            data = JSON.stringify(data);
            console.log(data);
        }
        $.ajax({
            type: reqType,
            dataType: "json",
            url: url,
            data: data,
            contentType: "text/plain",
            // contentType: contentType,
            // headers: {
            //     "my-first-header": "first value",
            //     "my-second-header": "second value"
            // },
            // beforeSend: function (xhr) {
            //     if (includeToken) {
            //         xhr.setRequestHeader("banana",accessToken);
            //     }
            // },
            success: function (res) {
                console.log("%c" + origURL + " JSON:", 'color: red;');
                console.log(res);
                if (callbackData) console.log(callbackData);
                if (callback) callback(res, callbackData);
            },
            error: function (jqXHR, textStatus, errorThrown) {
                if (callback) callback(undefined, callbackData);
                if (typeof promptUser !== "undefined" && showErrorMessage) {
                    dataText = JSON.stringify(JSON.parse(data), undefined, "    ");
                    promptUser(`<div style="font-weight: bold; color: red; text-align: center;">A network error occured.  You should refresh and verify any changes to continue.</div>
                                <div><span style="font-weight: bold;">Code: </span>${jqXHR.status}</div>
                                <div><span style="font-weight: bold;">Status: </span>${textStatus}</div>
                                <div><span style="font-weight: bold;">Time: </span>${Date.now()}</div>
                                <div><span style="font-weight: bold;">Error: </span>${errorThrown}</div>
                                <div><span style="font-weight: bold;">API: </span>${origURL}</div>
                                <div><span style="font-weight: bold;">Data: </span><pre>${dataText}</pre></div>
                                `);
                }
            }
        });
    }
    data.host = window.location.hostname;
    if (sessionID) data.sessionID = sessionID;

    var cognitoUser = getCognitoUser();
    if (cognitoUser) {
        cognitoUser.getSession(function (err, session) {
            console.log("getSession err:")
            console.log(err);
            console.log("getSession session:")
            console.log(session);

            if (session) {
                if (session.accessToken && session.accessToken.payload && session.accessToken.payload["cognito:groups"] && session.accessToken.payload["cognito:groups"].includes("employee")) {
                    data.accessSite = "customer";
                    if (window.location.pathname.startsWith("/manage")) data.accessSite = "manage";
                    if (window.location.pathname.startsWith("/pos")) data.accessSite = "pos";
                    if (window.location.pathname.startsWith("/storm")) data.accessSite = "storm";
                }

                localStorage.ccCurrentUserEmail = session.idToken.payload.email;
                updateUserDisplay(true, session.accessToken && session.accessToken.payload && session.accessToken.payload["cognito:groups"]);
                var accessToken = session.getAccessToken().jwtToken;
                console.log(accessToken);
                data.accessToken = accessToken;
            } else {
                localStorage.ccCurrentUserEmail = undefined;
                updateUserDisplay(false);
            }
            doGetJSON(url, data, callback, callbackData);
        });
    } else {
        localStorage.ccCurrentUserEmail = undefined;
        console.log("cognitoUser: nil");
        updateUserDisplay(false);

        doGetJSON(url, data, callback, callbackData);
    }

}

var setCookie = function (cname, cvalue) {
    exdays = 365;
    var d = new Date();
    d.setTime(d.getTime() + (exdays * 24 * 60 * 60 * 1000));
    var expires = "expires=" + d.toUTCString();
    document.cookie = cname + "=" + cvalue + ";" + expires + ";path=/";
}

var getCookie = function (cname) {
    var name = cname + "=";
    var ca = document.cookie.split(';');
    for (var i = 0; i < ca.length; i++) {
        var c = ca[i];
        while (c.charAt(0) == ' ') {
            c = c.substring(1);
        }
        if (c.indexOf(name) == 0) {
            return c.substring(name.length, c.length);
        }
    }
    return "";
}

var loadCookies = function () {
    sessionID = getCookie("sessionID");
    appClientID = getCookie("appClientID");
    userPoolID = getCookie("userPoolID");
}

var loadingCountInc = 0;
var loadingCounters = {};
var loadingTimers = {};
var getLoadingID = function (loadingWrapper) {
    var loadingID = loadingWrapper.data("loadingID");
    if (!loadingID) {
        loadingCountInc++;
        loadingID = loadingCountInc;
        loadingWrapper.data("loadingID", loadingID);
    }
    return loadingID;
}

var setLoading = function (selector, start, callback) {
    if (start) {
        $(document.activeElement).blur();
        var loadingWrapper = $(selector).closest(".loadingWrapper");
        var loadingID = getLoadingID(loadingWrapper);

        loadingWrapper.removeClass("loadingDone");
        loadingWrapper.addClass("loading");

        var loadCount = loadingCounters[loadingID];
        if (!loadCount) loadCount = 0;
        loadCount++;
        loadingCounters[loadingID] = loadCount;
        console.log(loadingCounters);
        // clearTimeout(loadingTimers[loadingWrapper]);
    } else {
        var loadingWrapper = $(selector).closest(".loadingWrapper");
        var loadingID = getLoadingID(loadingWrapper);


        var loadCount = loadingCounters[loadingID];
        loadCount--;
        loadingCounters[loadingID] = loadCount;
        if (loadCount === 0) {
            loadingWrapper.addClass("loadingDone");
            var oldTimer = loadingTimers[loadingID];
            if (oldTimer) {
                clearTimeout(oldTimer);
                loadingTimers[loadingID] = undefined;
            }
            var newTimer = setTimeout(() => {
                if (loadingWrapper.hasClass("loadingDone")) {
                    loadingWrapper.removeClass("loading loadingDone");
                    if (callback) {
                        setTimeout(callback, 1);
                    }
                }
            }, 600);
            loadingTimers[loadingID] = newTimer;
        }
    }
}

var selectizeDefinePlugins = function () {
    function clearRemovedItemCacheSelectizePlugin() {
        const self = this;

        this.removeItem = (function () {
            const original = self.removeItem;

            return function (...args) {
                original.apply(self, args);

                const [value] = args;

                if (self.renderCache && self.renderCache.item) {
                    delete self.renderCache.item[value];
                }
            };
        }());
    }

    Selectize.define('clear_removed_item_cache', clearRemovedItemCacheSelectizePlugin);


    Selectize.define('continue_editing', function (options) {
        if (this.settings.mode != 'single') return;

        var self = this;

        options.text = options.text || function (option) {
            return option[this.settings.labelField];
        };

        this.onClick = (function (e) {
            var original = self.onClick;

            return function (e) {
                // console.log(e);
                if (this.lastTime) {
                    console.log("clicked");
                    var ellapsedTime = performance.now() - this.lastTime;
                    console.log("ellap: " + ellapsedTime);
                    if (ellapsedTime < 500) {
                        console.log("double clicked");
                        this.$control_input.select();
                    } else {
                        var that = this;
                        console.log(e);
                        if (!$(e.target).is("input")) {
                            $(that.$control_input)[0].selectionEnd = 99999;
                            $(that.$control_input)[0].selectionStart = 99999;
                        }
                    }
                }
                this.lastTime = performance.now();

                original.apply(this, arguments);
            }
        })();
        this.onFocus = (function (e) {
            var original = self.onFocus;

            return function (e) {
                original.apply(this, arguments);

                var index = this.caretPos - 1;
                if (index >= 0 && index < this.items.length) {
                    var option = this.options[this.items[index]];
                    var currentValue = options.text.apply(this, [option]);
                    if (this.deleteSelection({ keyCode: 8 })) {
                        this.removeItem(currentValue);
                        this.setTextboxValue(currentValue);
                    }
                }
            };
        })();
    });

    Selectize.define('preserve_on_blur', function (options) {
        var self = this;

        options.text = options.text || function (option) {
            return option[this.settings.labelField];
        };

        this.onBlur = (function (e) {
            var original = self.onBlur;

            return function (e) {
                // Capture the current input value
                var $input = this.$control_input;
                var inputValue = $input.val();

                // Do the default actions
                original.apply(this, e);

                // Set the value back                    
                this.setTextboxValue(inputValue);
            };
        })();
    });

}
var sharedReady = function () {
    selectizeDefinePlugins();

}

var constructProductImageURL = function (resultURL, small) {
    if (!resultURL) return "/noImage_" + Date.now();
    if (resultURL.startsWith("https://")) return resultURL;

    // if (resultURL.length - resultURL.lastIndexOf("/") > 30) {
    //https://conduct-catalog-images.s3-us-west-2.amazonaws.com/normal/magic_singles/dom/00d89839-60d7-4de2-a78a-1afdcc21c053_1562730535.jpg
    var prefix = "https://conduct-catalog-images.s3-us-west-2.amazonaws.com/";
    prefix += small ? "small/" : "normal/"
    return prefix + resultURL;
    // } else {
    //     var prefix = "https://magicstronghold.conduct.goodge.ca/catalog_images/"
    //     if (small) prefix += "small/"
    //     resultURL = resultURL.replace("/CON/", "/CONflux/");
    //     return prefix + resultURL;
    // }
}

var populateOrderHistory = function ($tbody, orders) {
    $tbody.empty();
    $(".customers .customerDetailsWrapper .orderCount").text("(" + orders.length + ")");
    orders.forEach(function (val) {
        var newRow = $("<tr></tr>");
        var orderDate = new Date(val.paymentDate);
        var orderLink = $(`<td class="text-center"><a class="orderLink" href="orders/${val.id}">${val.id}</a></td>`);
        orderLink.click(function (event) {
            event.preventDefault();
            console.log(event);
            doAccountDetails("orders", val.id);
        })
        orderLink.appendTo(newRow);
        $(`<td><span class="text-nowrap">${orderDate.toLocaleDateString()}</span> <span class="text-nowrap">${orderDate.toLocaleTimeString()}</span></td>`).appendTo(newRow);
        $(`<td>${channelNameMap[val.orderType] || val.orderType}</td>`).appendTo(newRow);

        var statusTextClass = "";
        if (["readyForPickup", "awaitingPayment"].includes(val.status)) statusTextClass = "pickupOrder";
        $(`<td class="${statusTextClass}">${statusMap[val.status] || val.status}</td>`).appendTo(newRow);
        $(`<td>$${round(val.total, 2, true)}</td>`).appendTo(newRow);

        newRow.appendTo($tbody);
    })
}

var getNumFormatter = memoize(function (decimals, keepTrailingZeros = false, digitGrouping = false, showCurrency = false) {
    var nf = new Intl.NumberFormat("en-US", {
        maximumFractionDigits: decimals,
        minimumFractionDigits: keepTrailingZeros ? decimals : 0,
        currency: "USD",
        useGrouping: digitGrouping,
        style: showCurrency ? "currency" : undefined
    })
    return nf;
})

var round = function (value, decimals, keepTrailingZeros = false, digitGrouping = false, showCurrency = false) {
    // var res = Number(Math.round(value + 'e' + decimals) + 'e-' + decimals);
    // res = parseFloat(res).toFixed(decimals);
    // if (!keepTrailingZeros) res = res.replace("." + "0".repeat(decimals), "");
    // if (digitGrouping) res = Number(res).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    // if (showCurrency) {
    //     res = "$" + res;
    //     res = res.replace("$-", "-$");
    // }
    // return res;
    var res = getNumFormatter(decimals, true, digitGrouping, showCurrency).format(value);
    if (!keepTrailingZeros) {
        var res1 = getNumFormatter(decimals, false, digitGrouping, showCurrency).format(value);
        var res2 = getNumFormatter(0, false, digitGrouping, showCurrency).format(value);
        if (res1 == res2) res = res2;
    }
    return res;
}

var limitToLimitText = function (userCheckoutQuantityLimit, userCheckoutQuantityLimitResetMinutes) {
    var limitText = "";
    if (userCheckoutQuantityLimit && userCheckoutQuantityLimitResetMinutes) {
        limitText = `Limit ${userCheckoutQuantityLimit}`;
        if (userCheckoutQuantityLimitResetMinutes) {
            if (userCheckoutQuantityLimitResetMinutes % 43200 == 0) {
                var perCount = userCheckoutQuantityLimitResetMinutes / 43200;
                if (perCount == 1) {
                    limitText += ` / month`;
                } else {
                    limitText += ` / ${perCount} months`;
                }
            } else if (userCheckoutQuantityLimitResetMinutes % 10080 == 0) {
                var perCount = userCheckoutQuantityLimitResetMinutes / 10080;
                if (perCount == 1) {
                    limitText += ` / week`;
                } else {
                    limitText += ` / ${perCount} weeks`;
                }
            } else if (userCheckoutQuantityLimitResetMinutes % 1440 == 0) {
                var perCount = userCheckoutQuantityLimitResetMinutes / 1440;
                if (perCount == 1) {
                    limitText += ` / day`;
                } else {
                    limitText += ` / ${perCount} days`;
                }
            } else if (userCheckoutQuantityLimitResetMinutes % 60 == 0) {
                var perCount = userCheckoutQuantityLimitResetMinutes / 60;
                if (perCount == 1) {
                    limitText += ` / hour`;
                } else {
                    limitText += ` / ${perCount} hours`;
                }
            } else {
                var perCount = userCheckoutQuantityLimitResetMinutes;
                if (perCount == 1) {
                    limitText += ` / minute`;
                } else {
                    limitText += ` / ${userCheckoutQuantityLimitResetMinutes} minutes`;
                }
            }
        }
    }
    return limitText;

}

var escape = function (str) {
    const entities = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
        '`': '&#96;',
        ',': '&#44;',
        '!': '&#33;',
        '@': '&#64;',
        '#': '&#35;',
        '$': '&#36;',
        '%': '&#37;',
        '(': '&#40;',
        ')': '&#41;',
        '=': '&#61;',
        '+': '&#43;',
        '{': '&#123;',
        '}': '&#125;',
        '[': '&#91;',
        ']': '&#93;'
    };

    return String(str).replace(
        /[&<>"'`,!@#$%()=+{}\[\]]/g,
        char => entities[char]
    );
}

var populateStoreCreditHistory = function ($creditHistoryTable, storeCredit) {
    var creditTotal = "$" + parseFloat(storeCredit.storeCredit).toFixed(2);
    $creditHistoryTable.find(".creditAmount").text(creditTotal);
    var creditHistoryBody = $creditHistoryTable.find("tbody");
    creditHistoryBody.empty();
    $(".customers .customerDetailsWrapper .creditTotal").text("(" + creditTotal + ")");

    storeCredit.history.forEach(function (val) {
        var historyDate = new Date(val.date);
        var newRow = $("<tr></tr>")
        if (val.orderID) {
            var linkHTML = "<td>Payment to Order <a href='orders/" + val.orderID + "'>#" + val.orderID + "</a></td>";
            if (val.amount >= 0) {
                if (val.reason.toLowerCase().includes("refund")) {
                    linkHTML = "<td>Refund from Order <a href='orders/" + val.orderID + "'>#" + val.orderID + "</a></td>"
                } else if (val.reason.toLowerCase().includes("store credit bonus")) {
                    linkHTML = "<td>Credit Bonus from Order <a href='orders/" + val.orderID + "'>#" + val.orderID + "</a></td>"
                } else {
                    linkHTML = "<td>Purchase from Order <a href='orders/" + val.orderID + "'>#" + val.orderID + "</a></td>"
                }
            }
            var orderLink = $(linkHTML);
            orderLink.find("a").click(function (event) {
                event.preventDefault();
                doAccountDetails("orders", val.orderID);
            })
            orderLink.appendTo(newRow);
        } else {
            $("<td>" + val.reason + "</td>").appendTo(newRow);

        }
        $("<td>" + historyDate.toLocaleDateString() + "</td>").appendTo(newRow);
        $("<td>$" + parseFloat(val.amount).toFixed(2) + "</td>").appendTo(newRow);
        $("<td>" + (val.employeeName ? val.employeeName : "Website") + "</td>").appendTo(newRow);
        newRow.appendTo(creditHistoryBody);
    })
}

var lastPopupWindow;
var popupPrintWindow = function (onLoad) {
    if (lastPopupWindow && !lastPopupWindow.closed) lastPopupWindow.close();
    lastPopupWindow = undefined;
    printerReady = false;

    setTimeout(function () {
        var winTop = window.screenY + 20;
        var winLeft = window.screenX + 20;
        var winHeight = $(window).height() * 0.9;
        var winWidth = winHeight * 0.77;
        var printURL = "https://print.conductcommerce.com/";
        if (window.location.host.includes("conduct.good") || window.location.host.includes("local.good")) printURL = `http://${window.location.host}:83/print.html`;
        var win = window.open(printURL, Math.random(), `toolbar=no,location=no,directories=no,status=no,menubar=no,scrollbars=yes,resizable=yes,width=${winWidth},height=${winHeight},top=${winTop},left=${winLeft}`);
        lastPopupWindow = win;
        if (win && onLoad) onLoad(win);
    }, 1)
}

var printerReady = false;
window.addEventListener("message", function (event) {
    console.log("msg received");
    if (event.data == "printer ready") {
        printerReady = true;
    }
})

var printWindowSetContent = function (targetWin, title, body) {
    var newMsg = {
        title: title,
        body: body
    }
    var sendTimer;
    var sendFunc = function () {
        if (printerReady) {
            targetWin.postMessage(newMsg, "*");
            printerReady = false;
            clearInterval(sendTimer);
        }
        if (targetWin.closed) {
            clearInterval(sendTimer);
            return;
        }
    }
    sendTimer = setInterval(sendFunc, 250);
    sendFunc();
}

var nth = function (d) {
    if (d > 3 && d < 21) return 'th';
    switch (d % 10) {
        case 1: return "st";
        case 2: return "nd";
        case 3: return "rd";
        default: return "th";
    }
}
var shortMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"];

var formatCamelText = function (camelText) {
    const caseSplitRegex = /[A-Z0-9]?[a-z]+|[0-9]+|[A-Z]+(?![a-z])/g;
    return camelText.match(caseSplitRegex).join(" ");

}

var formatGiftCardCode = function (giftCardCode) {
    var giftCardDisplayID = "";
    var i = 0;
    for (v of giftCardCode) {
        if (i > 0 && i % 5 == 0) giftCardDisplayID += "-";
        i++;
        giftCardDisplayID += v;
    }
    return giftCardDisplayID.toUpperCase();
}

var stripGiftCardCode = function (giftCardCode) {
    return giftCardCode.replace(/[^0-9a-z]/gi, '').toUpperCase();
}

var validGiftCardCharacters = ["B", "C", "D", "F", "G", "H", "J", "K", "M", "P", "Q", "R", "T", "V", "W", "X", "Y", "Z", "2", "3", "4", "6", "7", "8", "9"];
var isValidGiftCardCode = function (giftCardCode) {
    var isGC = true;
    for (c of giftCardCode) {
        if (!validGiftCardCharacters.includes(c)) {
            isGC = false;
            break;
        }
    }
    if (giftCardCode.length != 20) isGC = false;
    return isGC;
}

var getTimeZoneName = function (preferLocalSystemTimeZone = false) {
    if (preferLocalSystemTimeZone) {
        var computerTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (computerTimeZone) return computerTimeZone; //bug in Chrome would return undefined when BC/AB moved to perm DST
    }
    return storeTimeZone;
}