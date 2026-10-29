var customizations;
var storeCurrency = "USD";
var storeCountry = "United States";

var buyMode = false;
var storeCreditBuyBonus = "";

var addressEditor;
var productSearch;
var productSearchCategories;
var orderDetailsTable;

var deckBuilderConditions;
var paypalClientID;

var last;

var doHistory = false;
var loadStorePath = function (inlineLoad) {
    var parts = window.location.pathname.split("/");
    parts = parts.map(val => decodeURIComponent(val));
    doHistory = false;
    var validPath = false;
    if (parts.length >= 3 && parts[1] == "store") {
        if (parts.includes("item")) {
            var itemIndex = parts.indexOf("item");
            if (!inlineLoad) viewItemDetails(parts[itemIndex + 1]);
            validPath = true;
        } else if (parts.includes("bundle")) {
            var itemIndex = parts.indexOf("bundle");
            if (!inlineLoad) viewBundleDetails(parts[itemIndex + 1]);
            validPath = true;
        } else if (parts[2] === "sale" && parts.length >= 4) {
            if (!inlineLoad) loadSearch(parts[4], false, parts[3]);
            validPath = true;
        } else if (parts[2] === "category" && parts.length >= 4) {
            if (!inlineLoad) loadSearch(parts[3], true);
            validPath = true;
        } else if (parts.includes("passwordReset")) {
            doHome();
            doPasswordReset();
            validPath = true;
        }

        if (parts[2] === "search" && parts.length >= 4) {
            if (parts[3] == "") {
                loadSearch();
            } else if (!inlineLoad) loadSearch(parts[3], false);
            validPath = true;
        }
        if (parts[2] === "cart") {
            doCart();
            validPath = true;
        }
        if (parts[2] === "deckbuilder") {
            doDeckBuilder();
            validPath = true;
        }
        if (parts[2] === "pages") {
            var targetPage = "info";
            if (parts.length > 3) targetPage = parts[3];
            doPages(targetPage);
            validPath = true;
        }
        if (parts[2] === "account") {
            var section = "user";
            var subsection = "";
            if (parts.length >= 4 && parts[3]) section = parts[3];
            if (parts.length >= 5 && parts[4]) subsection = parts[4];

            doAccountDetails(section, subsection);
            validPath = true;
        }
    }
    if (!validPath) {
        doHome();
    }
}

var loadTarget = function (target) {
    history.scrollRestoration = "auto";
    if (target.search) {
        var productTypeID = $("#productSearchCategories").val();
        if (productTypeID == "0") productTypeID = undefined;
        doSearch(target.search, false, target.renderCacheID, undefined, productTypeID);
    }
    if (target.advancedSearch) {
        doSearch(undefined, undefined, "advancedSearch");
    }
    if (target.inventoryID) {
        history.scrollRestoration = "manual";
        viewItemDetails(target.inventoryID);
    }
    if (target.category) {
        doSearch(target.category, true, target.renderCacheID);
    }
    if (target.sale) {
        doSearch(target.saleName, false, target.renderCacheID, target.sale);
    }
    if (target.home) {
        loadStorePath();
    }
    if (target.bundleID) {
        loadStorePath();
    }
    if (target.deckBuilder) {
        loadStorePath();
    }
    if (target.pages) {
        loadStorePath();
    }
    if (target.account) {
        loadStorePath();
    }
    if (target.cart) {
        loadStorePath();
    }
    if (target.checkout) {
        doCheckout(target.section);
    }
    if (target.checkoutBuy) {
        doCheckoutBuy(target.section);
    }
}

var imageZoomedViewer = false;
var imageZoomedPath = "";
var imageZoomedState;


window.addEventListener('popstate', function (e) {
    console.log(e.state);
    if (imageZoomedViewer) {
        history.scrollRestoration = "manual";
        imageZoomedViewer.hide();
        history.pushState(imageZoomedState, null, imageZoomedPath);
        imageZoomedViewer = false;
    } else {
        history.scrollRestoration = "auto";
        var loadTargetState = e.state;
        if (loadTargetState) {
            loadTarget(loadTargetState);
        } else {
            loadStorePath();
        }
    }
});

var searchRenderCache = {};
var currentRenderCacheID = undefined;
var loadSearch = function (searchText, isCategory, saleID) {
    var state = {
        renderCacheID: Date.now()
    };
    var url = "/store/";
    if (searchText === undefined && !saleID) {
        state.advancedSearch = true;
        state.renderCacheID = "advancedSearch";
        url += "search/";
    } else if (saleID) {
        state.sale = saleID;
        url += "sale/" + saleID;
        if (searchText) {
            url += "/" + searchText;
            state.saleName = searchText;
        };

    } else if (isCategory) {
        state.category = searchText;
        url += "category/" + searchText;
    } else {
        state.search = searchText;
        url += "search/" + searchText;
    }

    if (doHistory) {
        if (JSON.stringify(history.state) !== JSON.stringify(state)) {
            url = encodeURI(url);
            history.pushState(state, null, url);
            console.log("push");
            console.log(state);
        }
    } else {
        doHistory = true;
        history.replaceState(state, null);
    }

    loadTarget(state);
}

var requestPasswordReset = function (email) {
    var userPool = new AmazonCognitoIdentity.CognitoUserPool({
        UserPoolId: userPoolID,
        ClientId: appClientID
    });
    var cognitoUser = new AmazonCognitoIdentity.CognitoUser({
        Username: email,
        Pool: userPool
    });

    cognitoUser.forgotPassword({
        onSuccess: function (result) {
            messageBox("A password reset link has been sent to <span style='font-weight: bold'>" + email + "</span>.  Please check your e-mail to finish resetting your password.");
        },
        onFailure: function (err) {
            if (err.code == "UserNotFoundException") {
                messageBox("No account with e-mail address " + email + " was found.");
            } else {
                messageBox("An unknown error has occured.");
            }
        },
        // inputVerificationCode() {
        //     messageBox("A password reset link has been sent to " + email + ".  Please check your e-mail to update your password.");
        // }
    });
}

var passwordResetBlock = false;
var doPasswordReset = function () {
    if (passwordResetBlock) return;
    passwordResetBlock = true;

    var searchParams = new URLSearchParams(location.search);
    var emailAddress = searchParams.get("email");
    var code = searchParams.get("code");

    messageBox("Enter a new password for <span style='font-weight: bold'>" + emailAddress + "</span>:", {
        showInput: true,
        inputMinLength: 6,
        inputType: "password",
        onSubmit: function (inputText) {
            var userPool = new AmazonCognitoIdentity.CognitoUserPool({
                UserPoolId: userPoolID,
                ClientId: appClientID
            });

            var cognitoUser = new AmazonCognitoIdentity.CognitoUser({
                Username: emailAddress,
                Pool: userPool
            });

            cognitoUser.confirmPassword(code, inputText, {
                onSuccess: function (res) {
                    messageBox("Password changed.");
                    loginUser(emailAddress, inputText, false, true);
                }, onFailure: function (err) {
                    if (err.code == "ExpiredCodeException") {
                        messageBox("Reset link has expired.  Please reset your password again.");
                    } else {
                        messageBox("Password change failed.");
                    }
                    console.log(err);
                }
            });
        }
    })


}
var doHome = function () {
    var state = { home: true };
    var url = "/";
    if (doHistory) {
        if (JSON.stringify(history.state) !== JSON.stringify(state)) {
            history.pushState(state, null, url);
            console.log("push");
            console.log(state);
        }
    } else {
        doHistory = true;
        history.replaceState(state, null);
    }

    if ($("#mainMenu").jstree(true)) {
        mainMenuSearchToggle(false);
        $("#mainMenu").jstree(true).close_all();
        productSearchCategories[0].selectize.setValue("0");
    }

    switchView("home");
    window.scroll(0, 0);
}

var searchFilters = {};
var makeSearchFilters = function (productTypes) {
    productTypes.forEach(function (productType) {
        if (productType.filters === undefined) productType.filters = [];
        searchFilters[productType.id] = {
            name: productType.name,
            filters: productType.filters
        };
    })
}
var searchSorts = {};
var makeSearchSorts = function (productTypes) {
    productTypes.forEach(function (productType) {
        if (productType.sorts === undefined) productType.sorts = [];
        searchSorts[productType.id] = {
            name: productType.name,
            sorts: productType.sorts
        };
    })
}

var productTypes = [];
var makeSearchProductTypes = function (productTypesRes) {
    productTypes = productTypesRes;
    productTypes.forEach(function (productType) {
        productSearchCategories[0].selectize.addOption({ value: productType.id, text: productType.name });

        var newProductType = $("<li>" + productType.name + "</li>");
        newProductType.click(function (event) {
            $(".productTypes li").removeClass("active");
            $(event.target).addClass("active");
            makeSearchParameters(productType);
        })
        newProductType.appendTo(".productTypes");
    })
}
var makeSearchParameters = function (productType) {
    var searchParameters = $(".searchParameters");
    searchParameters[0].innerText = "";

    var newProductType = $("<div class='productType'>" + productType.id + "</div>");
    newProductType.data("id", productType.id);
    newProductType.appendTo(searchParameters);
    productType.parameters.forEach(function (parameter) {
        $("<div class='paramName'>" + parameter.name + "</div>").appendTo(searchParameters);
        switch (parameter.type) {
            case "text":
                var newText = $("<input type='text'>");
                newText.data("parameter", parameter);
                newText.appendTo(searchParameters);
                break;
            case "number":
                var newNumberHTML = "<div class='number'>" +
                    "<input type='text' class='numFrom'>" +
                    "<div>to</div>" +
                    "<input type='text' class='numTo'>" +
                    "</div>";
                var newNumber = $(newNumberHTML);
                newNumber.data("parameter", parameter);

                $(newNumber).appendTo(searchParameters);
                break;
            case "multi":
                var newSelect = $("<select><option></option></select>");
                parameter.values.forEach(function (val) {
                    $('<option value="' + encodeURIComponent(val.id) + '">' + val.name + "</option>").appendTo(newSelect);
                })

                newSelect.data("parameter", parameter);
                newSelect.appendTo(searchParameters);
                newSelect.selectize({ closeAfterSelect: true, maxItems: null, plugins: ['remove_button', 'clear_removed_item_cache'] });
                break;
            default:
                $("<br>").appendTo(searchParameters);
        }

    })
    $(".searchParameters .selectize-control").addClass("single");

    $("<br>").appendTo(searchParameters);
    $("#advancedSearch .advancedSearchBtn").clone(true).removeClass("hidden").appendTo(searchParameters);
}

var defaultCartID = 0;
var makeCarts = function (cartRes, activeCartID) {
    // cartRes.push(cartRes[0]);
    // cartRes.push(cartRes[0]);
    if (cartRes.length <= 0) return;
    console.log("items in cart: " + cartRes[0].quantity);
    defaultCartID = cartRes[0].id;
    setCartQty(cartRes[0].quantity, false);
    setCartQty(0, true);

    var carts = $("#carts > ol");
    var addCartBtn = $("#carts .addCartBtn").detach();
    carts[0].innerText = "";

    var cartsDropdown = $("#addCartsDropdown");
    cartsDropdown[0].innerText = "";
    cartRes.forEach(function (nextCart, i) {
        var newCart = $("#carts .cartTab.hidden").clone(true);
        newCart.removeClass("hidden");

        if (nextCart.id == "buy") nextCart.name = "Sell Your Cards";
        var cartName = nextCart.name;
        var cartCount = nextCart.quantity;
        var cartPrice = "$" + parseFloat(nextCart.totalPrice).toFixed(2);
        newCart.find(".cartName").text(cartName);
        newCart.find(".cartCount").text(cartCount);
        newCart.find(".cartPrice").text(cartPrice);
        newCart.data("cartData", nextCart);

        if (nextCart.id == "buy") {
            newCart.find(".deleteCartBtn").remove();
            setCartQty(nextCart.quantity, true);
        }

        if (activeCartID === undefined) {
            if (i == 0) newCart.addClass("active");
        } else {
            if (nextCart.id == activeCartID) newCart.addClass("active");
        }
        newCart.appendTo(carts);

        //add to cart dropdown list
        if (nextCart.id != "buy") {
            var newMenuItem = $("<div class='cartMenuBtn'>" + nextCart.name + "</div>");
            newMenuItem.click(function (event) {
                addVariantToCart(event);
                highlightOverlayRemove();
            });
            newMenuItem.data("cart", nextCart);
            newMenuItem.appendTo(cartsDropdown);
        }
    });
    var newMenuItem = $("<div class='cartMenuBtn'>Add New...</div>");
    newMenuItem.click(function (event) {
        console.log("new cart button clicked in dropdown");

        $(".addCartBox").css("top", $(event.target.parentElement).offset().top - $(window).scrollTop());
        $(".addCartBox").css("left", $(event.target.parentElement).offset().left - $(window).scrollLeft() - $(".addCartBox").outerWidth() + $(event.target.parentElement).outerWidth());
        $(newCartName).css("border-color", "");
        $(newCartName).closest("label").find(".formError").hide();
        cartsDropdown.hide();
        highlightOverlay([".addCartBox"]);
        newCartName.value = "";
        $("#newCartName").focus();

    });
    newMenuItem.appendTo(cartsDropdown);

    addCartBtn.appendTo(carts);
}

var getCarts = function (autoPopulate, populateID, activeCartID) {
    console.log("getCarts begin...");
    getJSON("getCarts", { getBuyCart: true }, function (res) {
        if (res && res.result && res.result.carts && res.result.carts.length > 0) {
            var dispCarts = [];
            for (cart of res.result.carts) {
                if (cart.id == "buy") {
                    if (populateID == "buy" || cart.quantity > 0) dispCarts.push(cart);
                } else {
                    dispCarts.push(cart);
                }
            }
            makeCarts(dispCarts, activeCartID);
            if (autoPopulate) {
                if (populateID == 0) {
                    populateCart(dispCarts[0]);
                } else {
                    dispCarts.forEach(function (cart, i) {
                        if (cart.id === populateID) populateCart(dispCarts[i]);
                    })
                }
            }
        }
    });

}
var doCart = function () {
    var state = { cart: true };
    var url = "/store/cart";
    if (doHistory) {
        if (JSON.stringify(history.state) !== JSON.stringify(state)) {
            history.pushState(state, null, url);
            console.log("push");
            console.log(state);
        }
    } else {
        doHistory = true;
        history.replaceState(state, null);
    }

    switchView("cart");
    $("#cartItems").empty();
    $("#cartCoupons").empty();
    $("#cartItemsCPM").empty();
    $("#wishlistItems").empty();
    validateCartContent(true);

    var defaultCartID = 0;
    if (buyMode && userLoggedIn) defaultCartID = "buy";
    getCarts(true, defaultCartID);
}

var doDeckBuilder = function () {
    var state = { deckBuilder: true };
    var url = "/store/deckbuilder";
    if (doHistory) {
        if (JSON.stringify(history.state) !== JSON.stringify(state)) {
            history.pushState(state, null, url);
            console.log("push");
            console.log(state);
        }
    } else {
        doHistory = true;
        history.replaceState(state, null);
    }

    switchView("deckBuilder");
}

var calculateDeckBuilderPrice = function () {
    console.log("recalculate price");
    var inputs = $("#deckBuilder .deckResult .variant:not(.hidden)>input.selectQuantity")
    // var inputs = $("#deckBuilder .deckResult input.selectQuantity");
    // inputs = inputs.filter(function (i, val) {
    //     var parentElm = $(val).parent();
    //     return (parentElm.hasClass("variant") && !parentElm.hasClass("hidden"));
    // });
    var total = 0.00;
    var totalItems = 0;
    $("#deckBuilder .deckResult .prodImage").addClass("noCard");
    $("#deckBuilder .deckResult .prodImage").attr("data-src", "/magicBack.jpg");
    $("#deckBuilder .deckResult .prodImageWrapper").removeClass("foil");
    $("#deckBuilder .deckResult .foilOverlay").removeClass("go");
    $("#deckBuilder .deckResult .prodImageWrapper.hidden .prodImage").removeClass("noCard");
    $("#deckBuilder .extraCard").remove();
    $("#deckBuilder .itemCount").hide();
    inputs.each(function (i, val) {
        var nextPrice = $(val).data("price");
        var selCount = parseInt($(val).val());
        if (isNaN(selCount)) selCount = 0;
        var extraAdded = false;
        totalItems += selCount;
        $(val).closest(".variant").css("background", selCount > 0 ? "#eeeeee" : "");
        // if (nextPrice && selCount > 0) {
        $(val).closest(".variant").find(".variantAddToCart").toggleClass("disabled", selCount == 0);

        if (selCount > 0) {
            var nextImg = $(val).data("image");
            var isFoil = $(val).data("foil");
            for (var i = 0; i < selCount; i++) {

                var targetImage = $(val).closest(".deckResult").find(".prodImage.noCard").first();
                if (targetImage && targetImage.length) {
                    targetImage.attr("data-src", constructProductImageURL(nextImg, true));
                    // $(val).closest(".deckResult").find(".prodImage.noCard").attr("src", "");
                    // targetImage.addClass("lazyload");
                    targetImage.removeClass("noCard");
                    var prodImageWrapper = targetImage.closest(".prodImageWrapper")
                    prodImageWrapper.toggleClass("foil", isFoil);

                    // targetImage.closest(".prodImageWrapper").find(".foilOverlay").toggleClass("hidden", !isFoil);

                } else {
                    extraAdded = true;

                    var newImage = $(val).closest(".deckResult").find(".prodImageWrapper.hidden").clone(true);
                    newImage.removeClass("hidden");
                    newImage.find(".prodImage").attr("src", constructProductImageURL(nextImg, true));
                    newImage.find(".prodImage").attr("data-src", "");
                    console.log(nextImg);
                    // newImage.find(".prodImage").removeClass("lazyload").addClass("lazyload");
                    newImage.addClass("extraCard");

                    var beforeCount = $(val).closest(".deckResult").find(".prodImageWrapper").length - 1;
                    newImage.css("top", beforeCount * 40 + "px");
                    newImage.appendTo($(val).closest(".deckResult").find(".cardImages"));
                    newImage.toggleClass("foil", isFoil);
                    // newImage.find(".foilOverlay").toggleClass("hidden", !isFoil);
                }
            }

            total += nextPrice * selCount;
        }
        var itemCardCount = $(val).closest(".deckResult").find(".prodImageWrapper").length - 1;
        var imagesHeight = 232 + (40 * itemCardCount);
        $(val).closest(".deckResult").find(".cardImages").css("height", imagesHeight + "px");

        if (extraAdded) {
            $(val).closest(".deckResult").find(".itemCount")[0].innerText = "(" + itemCardCount + ") ";
            $(val).closest(".deckResult").find(".itemCount").show();
        } else {
            var wantCount = $(val).closest(".deckResult").find(".prodImage").length - 1;
            var missingCount = $(val).closest(".deckResult").find(".prodImage.noCard").length;
            if (missingCount) {
                $(val).closest(".deckResult").find(".itemCount")[0].innerText = "(" + (wantCount - missingCount) + ") ";
                $(val).closest(".deckResult").find(".itemCount").show();
            } else {
                $(val).closest(".deckResult").find(".itemCount").hide();
            }
        }

    })
    $("#deckBuilder .deckResult .prodImage").addClass("lazyload");

    $(".deckOutput.deckPrice")[0].innerHTML = "&nbsp;- " + totalItems + " Cards - " + "$" + parseFloat(total).toFixed(2);
    checkFoilViewports();
}
var getDeckBuilderItems = function () {
    return $("#deckBuilder input.form-control").toArray().map(function (val) {
        return {
            inventoryID: $(val).data("inventoryID"),
            variantID: $(val).data("variantID"),
            variantCombinationID: $(val).data("variantCombinationID"),
            quantity: $(val).val()
        }
    }).filter(function (val) {
        return val.quantity > 0
    });
}
var submitDeckBuilder = function () {
    var deckString = $("#deckBuilder .deckList")[0].value;
    var showFoils = $("#deckBuilder .regularFoilSelect")[0].value == "foil";
    var showNonFoils = $("#deckBuilder .regularFoilSelect")[0].value == "regular";
    if ($("#deckBuilder .regularFoilSelect")[0].value == "both") {
        showFoils = true;
        showNonFoils = true;
    }
    var preferSingleSet = $("#deckBuilder #preferSingleSet").prop("checked");
    var inStockOnly = $("#deckBuilder #inStockOnly").prop("checked");

    var conditionIDs = deckBuilderConditions.slice(0, parseInt($("#deckBuilder .minimumQualitySelect").val()) + 1).map(val => val.conditionID);
    console.log("deckBuilder searching conditions: " + conditionIDs);
    var deckResults = $(".deckResults");
    var hiddenResult = deckResults.find(".deckResult.hidden").detach();
    deckResults[0].innerText = "";
    hiddenResult.appendTo(deckResults);

    $("#deckBuilder .submitDeckBuilder .submitIcon").removeClass("fa-fabook").addClass("fa-spinner fa-pulse");

    getJSON("deckBuilder", {
        deckList: deckString,
        showFoils: showFoils,
        showNonFoils: showNonFoils,
        preferSingleSet: preferSingleSet,
        inStockOnly: inStockOnly,
        conditionIDs: conditionIDs
    }, function (res) {
        $("#deckBuilder .submitDeckBuilder .submitIcon").addClass("fa-fabook").removeClass("fa-spinner fa-pulse");
        $("#deckBuilder .deckInput").hide();
        $(".deckOutput").show();

        if (res && res.success && res.result) {
            res.result.cards.forEach(function (search) {
                newResult = hiddenResult.clone(true);
                newResult.removeClass("hidden");


                newResult.data("targetQuantity", search.quantity);
                newResult.find(".itemTargetCount")[0].innerText = search.quantity + "x ";
                newResult.find(".cardName")[0].innerText = search.name;
                for (var i = 0; i < search.quantity; i++) {

                    var newImage = newResult.find(".prodImageWrapper.hidden").clone(true);
                    newImage.removeClass("hidden");
                    newImage.find(".prodImage").attr("data-src", "/magicBack.jpg");
                    newImage.find(".prodImage").addClass("noCard");
                    newImage.css("top", i * 40 + "px");
                    newImage.appendTo(newResult.find(".cardImages"));

                };
                var imagesHeight = 232 + (40 * search.quantity);
                newResult.find(".cardImages").css("height", imagesHeight + "px");
                var lastCategoryHeader;
                search.items.forEach(function (item) {
                    var newCard = newResult.find(".cardSet.hidden").clone(true);
                    newCard.removeClass("hidden");
                    newCard.appendTo(newResult.find(".cardSets"));

                    var headerName = item.name.replace(search.name, "");
                    var dashIndex = headerName.indexOf(" - ");
                    var pIndex = headerName.indexOf(" (");
                    if (dashIndex > -1 || pIndex > -1) {
                        var realMin;
                        if (dashIndex > -1) realMin = dashIndex;
                        if (pIndex > -1 && (realMin === undefined || pIndex < realMin)) realMin = pIndex;
                        if (realMin !== undefined) {
                            headerName = headerName.substr(realMin)
                        }
                    } else {
                        headerName = "";
                    }

                    var categoryNameDisplay = item.categoryName + headerName;
                    if (lastCategoryHeader == categoryNameDisplay) {
                        newCard.find(".setName").hide();
                        // newCard.find(".setName")[0].innerText = item.categoryName;
                    } else {
                        newCard.find(".setName")[0].innerText = categoryNameDisplay;
                    }
                    var isFoil = item.name.includes(" - Foil");
                    item.variants.forEach(function (variant, i) {
                        if (variant.selectedQuantity || variant.quantity || variant.default) {
                            var newVariant = newCard.find(".variant.hidden").clone(true);
                            newVariant.removeClass("hidden");

                            newVariant.find(".variantName")[0].innerText = variant.name;
                            var stockString = "Out of Stock"
                            if (variant.quantity) stockString = "Stock: " + variant.quantity;
                            newVariant.find(".variantStock")[0].innerText = stockString;
                            newVariant.find(".variantPrice")[0].innerText = "$" + parseFloat(variant.price).toFixed(2);
                            var selectedQuantity = 0;
                            if (variant.selectedQuantity) selectedQuantity = variant.selectedQuantity;
                            var origSelQuantity = newVariant.find(".selectQuantity");
                            $(origSelQuantity).val(selectedQuantity);
                            newVariant.find(".selectQuantity").on("input", function (event) {
                                var spinVal = parseInt($(event.target).val());
                                var spinMax = parseInt($(event.target).attr("max"));
                                if (spinVal > spinMax) {
                                    $(event.target).val(spinMax);
                                } else calculateDeckBuilderPrice();
                            });


                            origSelQuantity.inputSpinner({
                                buttonsClass: "btn-sm btn-orange btn-orange-spinner",
                                buttonsWidth: "28px"
                            });
                            // origSelQuantity.remove();
                            newVariant.find(".selectQuantity").data("price", variant.price);
                            newVariant.find(".selectQuantity").data("image", item.image);
                            newVariant.find(".selectQuantity").data("inventoryID", item.inventoryID);
                            newVariant.find(".selectQuantity").data("variantID", variant.id);
                            newVariant.find(".selectQuantity").data("variantCombinationID", variant.variantCombinationID);
                            newVariant.find(".selectQuantity").data("foil", isFoil);

                            var appendGroup = newVariant.find(".input-group-append");
                            newVariant.find(".variantSelAll").detach().appendTo(appendGroup);
                            newVariant.find(".variantAddToCart").detach().appendTo(appendGroup);



                            newVariant.appendTo(newCard);
                        }
                    });
                    lastCategoryHeader = categoryNameDisplay;
                });
                newResult.appendTo(deckResults);
                var prodDetailsHeight = newResult.find(".prodDetails").outerHeight();
                newResult.find(".cardSets").css("height", (imagesHeight - 16) + prodDetailsHeight + "px");
            })


        }
        calculateDeckBuilderPrice();
    })
}
var getAccountDetails = function () {
    $("#account > div").hide();
    var accountDetailsUserFields = $("#accountDetailsUserFields");
    accountDetailsUserFields.empty();
    getJSON("getAccountDetails", {}, function (res) {
        if (res && res.result && res.result.email && res.result.firstName && res.result.lastName && res.result.fields) {
            $("#accountUserDetails").show();

            $("#accountEmail").val(res.result.email).attr("origVal", res.result.email);
            $("#accountFirstName").val(res.result.firstName).attr("origVal", res.result.firstName);
            $("#accountLastName").val(res.result.lastName).attr("origVal", res.result.lastName);
            $("#accountPhoneNumber").val(res.result.phoneNumber).attr("origVal", res.result.phoneNumber);

            accountDetailsUserFields.empty();
            if (res.result.fields.length > 0) {
                var accountDetailsUserFieldsForm = $("#accountDetailsUserFieldsForm");
                for (nextField of res.result.fields) {
                    if (nextField.type != "text") continue;
                    if (nextField.value == null) nextField.value = "";

                    nextField.ui = {};
                    if (nextField.uiJSON) nextField.ui = JSON.parse(nextField.uiJSON);
                    var placeholderText = ""
                    if (nextField.ui.placeholder) placeholderText = nextField.ui.placeholder;

                    var userFieldNameRegistration = "";
                    if (nextField.ui.registerLink) userFieldNameRegistration = `<div class="userFieldNameRegistration">Need to sign up? Register <a href="${nextField.ui.registerLink}" target="_blank">here</a>.</div>`;

                    var newFieldText = $(`
                        <div class="accountDetailsUserField">
                            <label>
                                <div class="userFieldName">${nextField.name}</div>
                                ${userFieldNameRegistration}
                                <div><input type="text" value="${nextField.value}" placeholder="${placeholderText}" origVal="${nextField.value}" userFieldID="${nextField.id}"></div>
                            </label>
                        </div>
                        `);
                    newFieldText.appendTo(accountDetailsUserFields);
                }
                accountDetailsUserFieldsForm.show();
            }
        }
        if (res && res.errors && res.errors.length && res.errors.find(v => v.code == 7)) {
            $("#accountNeedLogin").show();
        }
    });
}

var getAddresses = function () {
    $("#submitNewAddress .text")[0].innerText = "Add New Address";
    addressDropdown[0].selectize.clear();
    addressDropdown[0].selectize.clearOptions();
    addressDropdown[0].selectize.addOption({ id: 0, fullName: "Add New..." });
    selectedAddressID = undefined;
    $("#deleteAddress").addClass("disabled");
    $("#checkoutAddress .checkoutSelectAddressBtn").addClass("disabled");
    $("#checkoutBuySelectAddressBtn").addClass("disabled");
    $("#ccPaymentForm .submitCCBtn").addClass("disabled");
    $("#submitStripeBtn").addClass("disabled");
    $("#addNewAddressBtn").addClass("disabled");
    $("#submitNewAddress").addClass("disabled");

    getJSON("getAddresses", {}, function (res) {
        if (res && res.success) {
            console.log(res.result.addresses);
            // addressDropdown[0].selectize.refreshOptions(false);
            if (res.result.addresses.length) {
                res.result.addresses.forEach(function (val) {
                    val.fullName = val.firstName + " " + val.lastName;
                    addressDropdown[0].selectize.addOption(val);
                })
                addressDropdown[0].selectize.addItem(res.result.addresses[0].id);
            } else {
                addressDropdown[0].selectize.addItem(0);
            }
        }
    });
}
var getAccountAddresses = function () {
    addressEditor.appendTo("#accountAddresses");

    $("#account > div").hide();
    $("#accountAddresses").show();
    getAddresses();
}

var checkoutOrderTotal = 0.0;
var checkoutCreditMax = 0.0;
var checkoutCreditApplied = 0.0;
var checkoutGiftCardApplied = 0.0;

var populateOrderDetails = function (orderDetailsTableWrapperTarget, orderDetails) {
    checkoutOrderTotal = orderDetails.total;

    // var orderDetailsTable = $(orderDetailsTable);
    var orderInfo = orderDetailsTable.find(".orderInfo");
    orderInfo.empty();

    $("#checkoutPaymentMissingWarning").hide();
    $("#checkoutPaymentRemovedWarning").hide();

    orderDetailsTable.find(".orderInfoNumber").text(orderDetails.orderID);
    if (orderDetails.paymentDate) {
        var orderDate = new Date(orderDetails.paymentDate);
        orderDetailsTable.find(".orderInfoDate").text(orderDate.toLocaleDateString() + " " + orderDate.toLocaleTimeString());
    } else {
        orderDetailsTable.find(".orderInfoDate").text("Pending");
    }

    var shippingMethodHTML = orderDetails.shippingMethodName;
    if (orderDetails.shippingCarrierDisplayName || orderDetails.shippingServiceDisplayName) {
        var shippingDisplayNameParts = [];
        if (orderDetails.shippingCarrierDisplayName) shippingDisplayNameParts.push(orderDetails.shippingCarrierDisplayName);
        if (orderDetails.shippingServiceDisplayName) shippingDisplayNameParts.push(orderDetails.shippingServiceDisplayName);
        shippingMethodHTML = shippingDisplayNameParts.join(" - ");
        if (orderDetails.shippingCustomerLabel) {
            shippingMethodHTML += `<br>${orderDetails.shippingCustomerLabel}`;
        }
    }
    orderDetailsTable.find(".orderInfoShippingMethod").html(shippingMethodHTML);

    if (orderDetails.preorderDate) {
        var preorderDateString = new Date(orderDetails.preorderDate).toLocaleDateString();
        orderDetailsTable.find(".orderPreorderDate").text(preorderDateString);
    }
    orderDetailsTable.find(".orderPreorderNotice").toggle(!!orderDetails.preorderDate);

    orderDetails.items.forEach(function (val) {
        var newRow = $("<tr></tr>");
        var itemNameCell = val.name;
        if (val.categoryName || val.variantName) {
            itemNameCell += "<br>" + val.categoryName;
            if (val.categoryName && val.variantName) {
                itemNameCell += " - ";
            }
            itemNameCell += val.variantName;
        }

        $("<td class='noRightBorder'>" + itemNameCell + "</td>").appendTo(newRow);
        var discountText = "";
        if (val.discount && val.discount != 0) {
            discountText = `<br>${val.discountReason}: ${round(val.discount * -1, 2, true, true, true)}`;
        }
        var bundleText = "";
        if (val.bundleDiscount && val.bundleDiscount != 0) {
            bundleText = `<br>${val.bundleName}: ${round(-val.bundleDiscount, 2, true, true, true)}`;
        }

        $("<td class='rightAlign noLeftBorder noWrap'>" + val.quantity + "x $" + parseFloat(val.price).toFixed(2) + " = $" + parseFloat(val.price * val.quantity).toFixed(2) + discountText + bundleText + "</td>").appendTo(newRow);
        newRow.appendTo(orderInfo);

        if (val.digitalInventory && val.digitalInventory.length > 0) {
            for (digitalCode of val.digitalInventory) {
                var digitalCodeExpiryDate = new Date(digitalCode.expiryDate);
                newDigitalCodeRow = $(`
                    <tr>
                        <td colspan="3"><span class="itemCodes">Code - Expires ${digitalCodeExpiryDate.toLocaleDateString()}</span><br>${digitalCode.content}</td>
                    </tr>`).appendTo(orderInfo);
            }
        }

    });

    var couponsWrapper = orderDetailsTable.find(".coupons");
    couponsWrapper.empty();

    for (nextCoupon of orderDetails.coupons || []) {
        if (nextCoupon.orderDiscountValue) {
            $(`<tr><td class="noRightBorder"><b>Coupon: </b>${nextCoupon.label}</td><td class="rightAlign noLeftBorder noWrap">${round(-nextCoupon.orderDiscountValue, 2, true, true, true)}</td></tr>`).appendTo(couponsWrapper);
        }
        if (nextCoupon.storeCreditBonusValue) {
            $(`<tr><td class="noRightBorder"><b>Coupon: </b>${nextCoupon.label}<br>Store Credit Bonus: +${round(nextCoupon.storeCreditBonusValue, 2, true, true, true)}</td><td class="rightAlign noLeftBorder noWrap"></td></tr>`).appendTo(couponsWrapper);
        }
    }

    var taxesWrapper = orderDetailsTable.find(".taxes");
    taxesWrapper.empty();
    orderDetails.taxes.forEach(function (tax) {
        $(`<div><span class="bold">${taxTypeMap[tax.name]}:</span> $${parseFloat(tax.amount).toFixed(2)}</div>`).appendTo(taxesWrapper);

    })

    orderDetailsTable.find(".orderInfoCreditDiscount").text(parseFloat(-orderDetails.storeCreditApplied).toFixed(2));

    orderDetailsTable.find(".orderInfoSubtotal").text(parseFloat(orderDetails.subtotal).toFixed(2));
    orderDetailsTable.find(".orderInfoShipping").text(parseFloat(orderDetails.shippingPrice).toFixed(2));
    orderDetailsTable.find(".orderInfoTotal").text(parseFloat(orderDetails.total).toFixed(2));

    checkoutCreditApplied = orderDetails.storeCreditApplied;
    checkoutGiftCardApplied = 0.0;
    if (orderDetails.giftCards) checkoutGiftCardApplied = orderDetails.giftCards.map(v => v.amount).reduce((a, b) => a + b, 0);
    orderDetailsTable.find(".orderInfoGiftCardDiscount").text(round(-checkoutGiftCardApplied, 2, true, true, true));

    var totalDue = orderDetails.total - checkoutCreditApplied - checkoutGiftCardApplied;
    if (totalDue > -0.000001 && totalDue < 0.000001) totalDue = 0;//used due to floating math quarks
    orderDetailsTable.find(".orderInfoTotalDue").text(round(totalDue, 2, true, true, false));
    $("#checkoutPayment .paymentType").toggleClass("zeroDue", !!(totalDue == 0));
    $("#stripeCCPaymentWrapper").toggleClass("lowValue", totalDue > 0 && totalDue < 0.499999); //used due to floating math quarks


    var paymentsWrapper = orderDetailsTable.find(".payments");
    paymentsWrapper.empty();

    var payTypeMap = {
        cash: "Cash",
        storeCredit: "Store Credit",
        card: "Credit Card",
        authorizeNet: "Credit Card",
        stripe: "Credit Card",
        paypal: "PayPal",
        giftCard: "Gift Card"
    }
    orderDetails.payments.forEach(function (payment) {
        var paymentType = payment.paymentType;
        if (payment.amount >= 0) {
            $(`<div>&nbsp;&bull;&nbsp;Payment of <span class="bold">$${parseFloat(payment.amount).toFixed(2)}</span> made by <span class="bold">${payTypeMap[paymentType]}</span></div>`).appendTo(paymentsWrapper);

        } else {
            $(`<div>&nbsp;&bull;&nbsp;Refund of <span class="bold">$${parseFloat(payment.amount).toFixed(2)}</span> made to <span class="bold">${payTypeMap[paymentType]}</span></div>`).appendTo(paymentsWrapper);
        }
    })

    var paymentsMade = orderDetails.payments.length > 0;
    orderDetailsTable.find(".storeCreditWrapper").toggle(!!(orderDetails.storeCreditApplied && !paymentsMade));
    orderDetailsTable.find(".giftCardAppliedWrapper").toggle(!!(checkoutGiftCardApplied && !paymentsMade));

    orderDetailsTable.find(".totalDueWrapper").toggle(!paymentsMade);
    orderDetailsTable.find(".orderInfoTotal").closest("div").toggle(paymentsMade);

    orderDetailsTable.appendTo(orderDetailsTableWrapperTarget);
}
var getAccountOrder = function (orderID) {
    $("#account > div").hide();
    $("#accountOrderHistory > table").hide();
    $("#accountOrderHistory").show();
    $("#orderInfoHistoryWrapper").empty();
    $("#accountOrderHistory .orderInfo").empty();
    getJSON("getOrder", { orderID: orderID }, function (res) {
        var orderInfo = $("#accountOrderHistory .orderInfo");
        if (res && res.success) {
            populateOrderDetails("#orderInfoHistoryWrapper", res.result)
        } else {
            $("<span class='orderHeader'>Order #" + orderID + " does not exist.</span>").appendTo(orderInfo);
        }
        if (res && res.errors && res.errors.length && res.errors.find(v => v.code == 7)) {
            $("#accountNeedLogin").show();
        }
    })
}

var getAccountOrders = function (orderID) {
    if (orderID) {
        getAccountOrder(orderID);
    } else {

        $("#account > div").hide();
        $("#orderInfoHistoryWrapper").empty();
        $("#accountOrderHistory").show();
        $("#orderHistoryTable").show()
        $("#accountOrderHistory .orderHistory")[0].innerText = "";
        getJSON("getOrders", {}, function (res) {
            if (res && res.success) {
                console.log(res.result.orders);
                var orderHistory = $("#orderHistoryTable .orderHistory");
                populateOrderHistory(orderHistory, res.result.orders);
            }
            if (res && res.errors && res.errors.length && res.errors.find(v => v.code == 7)) {
                $("#accountNeedLogin").show();
            }
        })
    }

}

var populateOrderSummary = function (orderID, orderItems, preorderDate, itemsMissing, itemsRemoved, coupons) {
    $(".orderNumber")[0].innerText = orderID;

    var summaryItems = $("#checkoutSummaryTable .checkoutOrderSummaryItems");
    summaryItems.empty();

    var subTotal = 0.00;

    var addNotificationItems = function (items, target, targetWrapper) {
        var oldItems = target.find("> div").toArray();
        if (items && items.length) {
            for (item of items) {
                var prevQuantity = 0;
                var oldItem = oldItems.find(v => $(v).data().variantID == item.variantID);
                if (oldItem) {
                    prevQuantity = $(oldItem).data().quantityRemoved;
                    $(oldItem).remove();
                }

                item.quantityRemoved = item.quantityRemoved + prevQuantity;
                var newRemovedItem = $(`<div>${item.quantityRemoved}x ${item.name}</div>`);
                newRemovedItem.data(item);
                target.append(newRemovedItem);
            }
        }
        targetWrapper.toggle(!!target.find("> div").length);
    }
    addNotificationItems(itemsRemoved, $("#checkoutSummaryRemovedWarningItems"), $("#checkoutSummaryRemovedWarning"));
    addNotificationItems(itemsMissing, $("#checkoutSummaryMissingWarningItems"), $("#checkoutSummaryMissingWarning"));


    orderItems.forEach(function (val) {
        var limitText = limitToLimitText(val.userCheckoutQuantityLimit, val.userCheckoutQuantityLimitResetMinutes);
        if (limitText) limitText = `<br><span class="prodPurchaseLimit">${limitText}</span>`;
        var inStorePickupText = "";
        if (val.inStorePickupOnly) inStorePickupText = `<br><span style="font-weight: bold;">In-Store Pickup Only</span>`;
        var domesticOnlyText = "";
        if (val.domesticOnly) domesticOnlyText = `<br><span style="font-weight: bold;">Can only be shipped to ${storeCountry}</span>`;

        var newRow = $("<tr></tr>");
        $("<td class='noRightBorder'>" + val.name + limitText + "<br>" + val.categoryName + " - " + val.variantName + inStorePickupText + domesticOnlyText + "</td>").appendTo(newRow);
        var lineTotal = val.price * val.quantity;
        var discountText = "";
        if (val.discount && val.discount != 0) {
            discountText = `<br>${val.discountReason}: ${round(val.discount * -1, 2, true, true, true)}`;
        }
        $("<td class='rightAlign noLeftBorder noWrap'>" + val.quantity + "x $" + parseFloat(val.price).toFixed(2) + " = $" + parseFloat(lineTotal).toFixed(2) + discountText + "</td>").appendTo(newRow);
        newRow.appendTo(summaryItems);

        subTotal += lineTotal;
        if (val.discount && val.discount != 0) subTotal -= val.discount;
    });
    var hasDomesticOnly = orderItems.some(v => v.domesticOnly);
    if (hasDomesticOnly) {
        $("#checkoutSummaryDomesticOnlyWarning div").html(`Some items can only be shipped domestically<br>Shipping will be limited to ${storeCountry}`);
        $("#checkoutSummaryDomesticOnlyWarning").show();
    } else {
        $("#checkoutSummaryDomesticOnlyWarning").hide();
    }

    for (coupon of coupons || []) {
        if (coupon.orderDiscountValue) {
            subTotal -= coupon.orderDiscountValue;
            var newRow = $(`
                <tr>
                    <td class='noRightBorder'><b>Coupon:</b> ${coupon.label}</td><td class='rightAlign noLeftBorder noWrap'>${round(-coupon.orderDiscountValue, 2, true, true, true)}</td>
                </tr>`);
            newRow.appendTo(summaryItems);

        }
        if (coupon.storeCreditBonusValue) {
            var newRow = $(`
                <tr>
                    <td class='noRightBorder'><b>Coupon: </b>${coupon.label}<br>Store Credit Bonus: +${round(coupon.storeCreditBonusValue, 2, true, true, true)}</td><td class='rightAlign noLeftBorder noWrap'></td>
                </tr>`);
            newRow.appendTo(summaryItems);
        }
    }


    $("#checkoutSummaryTable .checkoutOrderSummarySubtotal").text(parseFloat(subTotal).toFixed(2));

    if (preorderDate) {
        var preorderDateString = new Date(preorderDate).toLocaleDateString();
        $("#checkoutSummaryTable .checkoutOrderSummaryPreorderDate").text(preorderDateString);
    }
    $("#checkoutSummaryTable .checkoutOrderSummaryPreorderNotice").toggle(!!preorderDate);

    $("#checkoutSummaryTable .checkoutOrderSummaryInStorePickupOnlyNotice").toggle(orderItems.some(v => v.inStorePickupOnly));

    $("#checkoutSummaryFields").empty();
    if (orderItems.some(v => v.categoryName.toLowerCase().includes("roadshow"))) {
        $("#checkoutSummaryFieldsWrapper").show();
        var newCommentReq = $(`<label>Wizards Account Email <input type="email" required></label>`);
        newCommentReq.appendTo("#checkoutSummaryFields");
    } else {
        $("#checkoutSummaryFieldsWrapper").hide();
    }

}

var populateBuyOrderDetails = function (targetWrapper, order, singleItems) {
    targetWrapper.empty();

    $("#buyOrderInfoOrderNumber").text(order.buyOrderID);
    $("#buyOrderInfoStatus").text(buyOrderStatusMap[order.status] || order.status);

    var receivedDateString = "";
    if (order.pendingTransferDate || order.receivedDate) {
        var orderDate = new Date(order.pendingTransferDate || order.receivedDate);
        receivedDateString = orderDate.toLocaleDateString() + " " + orderDate.toLocaleTimeString();
    }
    $("#buyOrderInfoReceivedDate").text(receivedDateString);

    $("#buyOrderInfoGradedBtnWrapper").toggle(order.status == "graded");
    $("#buyOrderInfoGradedAcceptBtn, #buyOrderInfoGradedEditBtn").removeClass("disabled");
    $("#buyOrderInfoGradedEditBtn").toggle(!singleItems && !!order.items.find(v => !v.buyCPM));
    $("#buyOrderInfoTable").data("order", order);

    if (!order.adjustments) order.adjustments = [];

    for (item of order.items) {
        if (order.status == "new") {
            $(`<tr><td class="itemName">${item.inventoryName}<br><span class="itemCategory">${item.categoryName}</span></td><td></td></tr>`).appendTo(targetWrapper);
            var valuePrice = " @ $" + round(item.newPrice, 2, true);
            if (item.buyCPM) valuePrice += "/1000";
            var totalPrice = item.newPrice * item.newQuantity;
            if (item.buyCPM) totalPrice = totalPrice / 1000;
            totalPrice = "$" + round(totalPrice, 2, true);
            $(`<tr class="noTopBottomBorder"><td>${item.newQuantity}${valuePrice}</td><td>${totalPrice}</td></tr>`).appendTo(targetWrapper);
        }
        if (order.status == "approved" || order.status == "pendingTransfer" || order.status == "received") {
            $(`<tr><td class="itemName">${item.inventoryName}<br><span class="itemCategory">${item.categoryName}</span></td><td></td></tr>`).appendTo(targetWrapper);
            var valuePrice = " @ $" + round(item.approvedPrice, 2, true);
            if (item.buyCPM) valuePrice += "/1000";
            var totalPrice = item.newPrice * item.approvedQuantity;
            if (item.buyCPM) totalPrice = totalPrice / 1000;
            totalPrice = "$" + round(totalPrice, 2, true);
            $(`<tr class="noTopBottomBorder"><td>${item.approvedQuantity}${valuePrice}</td><td>${totalPrice}</td></tr>`).appendTo(targetWrapper);
        }
        if ((order.status == "graded" || order.status == "accepted" || order.status == "complete") && item.grades) {
            var currentProductType = order.productTypes.find(v => v.id == item.productTypeID);
            $(`<tr><td class="itemName">${item.inventoryName}<br><span class="itemCategory">${item.categoryName}</span></td><td></td></tr>`).appendTo(targetWrapper);

            item.displayGrades = [];
            for (variant of currentProductType.variants) {
                variant.count = 0;
                variant.IDs = [];
                item.displayGrades.push(variant);
            }
            item.displayGrades.push({
                id: "rejected",
                name: "Rejected",
                count: 0,
                IDs: [],
                percent: 0
            });
            item.displayGrades.push({
                id: "missing",
                name: "Missing",
                count: 0,
                IDs: [],
                percent: 0
            });
            item.displayGrades.push({
                id: "customerRejected",
                name: "Customer Rejected",
                count: 0,
                IDs: [],
                percent: 0
            });
            item.displayGrades.push({
                id: "custom",
                name: "Custom Offer",
                count: 0,
                IDs: [],
                percent: 0
            });

            for (grade of item.grades) {
                if (grade.status == "graded" && grade.customerResponse !== "rejected") {
                    var currentGrade = item.displayGrades.find(v => v.id == grade.gradeVariantID);
                    if (item.buyCPM) {
                        currentGrade.count += grade.quantity
                    } else {
                        currentGrade.count++;
                        currentGrade.percent = grade.percent;
                        currentGrade.hot = grade.hot;
                    }
                    currentGrade.IDs.push(grade.id);
                } else {
                    var findGrade = grade.status;
                    if (grade.customerResponse == "rejected") findGrade = "customerRejected";
                    var currentGrade = item.displayGrades.find(v => v.id == findGrade);
                    if (item.buyCPM) {
                        currentGrade.count += grade.quantity
                    } else {
                        currentGrade.count++;
                    }
                    currentGrade.IDs.push(grade.id);
                }
                // var displayGrade = item.displayGrades[currentGrade.id];
                // displayGrade.count++;
                // item.displayGrades[currentGrade.id] = displayGrade;
            }

            for (grade of item.displayGrades) {
                if (grade.count == 0) continue;
                // var currentGrade = currentProductType.variants.find(v => v.id == grade.gradeVariantID);
                var valuePrice = item.finalPrice * grade.percent;
                if (valuePrice) {
                    valuePrice = " @ $" + round(valuePrice, 2, true);
                    if (item.buyCPM) valuePrice += "/1000";
                } else {
                    valuePrice = "";
                }

                var totalPrice = item.finalPrice * grade.percent * grade.count;
                if (totalPrice) {
                    if (item.buyCPM) totalPrice = totalPrice / 1000;
                    totalPrice = "$" + round(totalPrice, 2, true);
                } else {
                    totalPrice = "";
                }

                if (singleItems && !item.buyCPM) {
                    for (ID of grade.IDs) {
                        if (grade.id == "custom") {
                            var thisGrade = item.grades.find(v => v.id == ID);
                            var gradingComment = thisGrade.gradingComment || "";
                            totalPrice = round(item.finalPrice * thisGrade.percent, 2, true, true, true);
                            valuePrice = ` @ ${totalPrice}`;
                            var newLine = $(`<tr class="noTopBottomBorder customGradeWrapper"><td><div>1x&nbsp</div><div>${grade.name}${valuePrice}<div class="customGradeComment">${gradingComment}</div></div></td><td><label><input type="checkbox"> Remove</label></td></tr>`);
                            newLine.data("price", item.finalPrice * thisGrade.percent);
                        } else {
                            var newLine = $(`<tr class="noTopBottomBorder"><td>1x ${grade.name}${valuePrice}</td><td><label><input type="checkbox"> Remove</label></td></tr>`);
                            newLine.data("price", item.finalPrice * grade.percent);
                        }
                        newLine.data("itemID", ID);
                        newLine.find("input").change(function (event) {
                            var gradedTotal = order.gradedTotal;
                            var checkboxes = targetWrapper.find("input:checked").toArray();
                            for (checkbox of checkboxes) {
                                var itemID = $(checkbox).closest("tr").data("itemID");
                                var itemPrice = $(checkbox).closest("tr").data("price");
                                gradedTotal -= itemPrice;

                            }
                            var adjustmentTotal = order.adjustments.map(v => v.amount).reduce((a, b) => a + b, 0);
                            gradedTotal = gradedTotal + adjustmentTotal;
                            gradedTotal = round(gradedTotal, 2, true);
                            targetWrapper.find(".totalValue").first().text("$" + gradedTotal);

                        })
                        newLine.appendTo(targetWrapper);
                    }
                } else {
                    if (grade.id == "custom") {
                        for (ID of grade.IDs) {
                            var thisGrade = item.grades.find(v => v.id == ID);
                            var gradingComment = thisGrade.gradingComment || "";
                            totalPrice = round(item.finalPrice * thisGrade.percent, 2, true, true, true);
                            valuePrice = ` @ ${totalPrice}`;
                            $(`<tr class="noTopBottomBorder customGradeWrapper"><td><div>1x&nbsp</div><div>${grade.name}${valuePrice}<div class="customGradeComment">${gradingComment}</div></div></td><td>${totalPrice}</td></tr>`).appendTo(targetWrapper);
                        }
                    } else {
                        $(`<tr class="noTopBottomBorder"><td>${grade.count}x ${grade.name}${valuePrice}</td><td>${totalPrice}</td></tr>`).appendTo(targetWrapper);
                    }
                }
            }
        }
        $(`<tr><td></td><td></td></tr>`).appendTo(targetWrapper);

    }
    var totalAdjustments = 0;
    for (nextAdjustment of order.adjustments) {
        $(`<tr><td class="itemName">Order Adjustment<br><span class="itemCategory">Employee: ${nextAdjustment.employeeFirstName}</span></td><td></td></tr>`).appendTo(targetWrapper);
        $(`<tr class="noTopBottomBorder"><td class="itemName">${nextAdjustment.reason}</td><td>${round(nextAdjustment.amount, 2, true, true, "$")}</td></tr>`).appendTo(targetWrapper);
        $(`<tr><td></td><td></td></tr>`).appendTo(targetWrapper);
        totalAdjustments = totalAdjustments + nextAdjustment.amount;
    }
    var totalString = "";
    var totalValue = 0;
    if (order.newTotal) {
        totalString = "Requested Total";
        totalValue = order.newTotal;
        totalValue = totalValue + totalAdjustments;
    }
    if (order.approvedTotal) {
        totalString = "Approved Total";
        totalValue = order.approvedTotal;
        totalValue = totalValue + totalAdjustments;
    }
    if (order.gradedTotal) {
        totalString = "Total Offered";
        totalValue = order.gradedTotal;
        totalValue = totalValue + totalAdjustments;
    }
    if (order.acceptedTotal) {
        totalString = "Accepted Total";
        totalValue = order.acceptedTotal;
    }
    $(`<tr class="totalLine"><td><div>${totalString}</div></td><td class="totalValue">$${round(totalValue, 2, true)}</td></tr>`).appendTo(targetWrapper);
    if (order.payments.length) {
        totalString = `Total Paid<br>${paymentTypeMap[order.paymentType] || order.paymentType}`;
        if (order.payments[0].destination) totalString += ` - ${order.payments[0].destination}`;
        totalValue = order.payments[0].amount;
        $(`<tr class="totalLine"><td><div>${totalString}</div></td><td class="totalValue">$${round(totalValue, 2, true)}</td></tr>`).appendTo(targetWrapper);
    } else {
        if (order.paymentType == "storeCredit") {
            $(`<tr class="totalLine"><td><div>Store Credit Bonus</div></td><td class="totalValue">+${storeCreditBuyBonus}</td></tr>`).appendTo(targetWrapper);
        }
    }
    // targetWrapper.text(JSON.stringify(order, null, " "));
    $("#buyOrderInfoRequested").toggle(order.status == "new");
    $("#buyOrderInfoApproved").toggle(order.status == "approved");
    $("#buyOrderInfoGrading").toggle(order.status == "received");
    $("#buyOrderInfoGraded").toggle(order.status == "graded");
    $("#buyOrderInfoCompletePaid").toggle((order.status == "accepted" || order.status == "complete") && !!order.paymentDate);
    $("#buyOrderInfoCompleteNotPaid").toggle((order.status == "accepted" || order.status == "complete") && !order.paymentDate);
}

var getAccountBuyOrder = function (orderID) {
    $("#account > div").hide();
    $("#accountBuyOrderHistory > table").hide();
    $("#accountBuyOrderHistory").show();
    $("#buyOrderInfo").empty();
    // $("#accountBuyOrderHistory .orderInfo").empty();
    getJSON("getBuyOrder", { buyOrderID: orderID }, function (res) {
        var orderInfo = $("#buyOrderInfo");
        if (res && res.success) {
            $("#buyOrderInfoWrapper").show();
            populateBuyOrderDetails(orderInfo, res.result)
        } else {
            if (res && res.errors && res.errors.length && res.errors.find(v => v.code == 7)) {
                $("#accountNeedLogin").show();
                $("#buyOrderInfoWrapper").hide();
            } else {
                $("<span class='orderHeader'>Order #" + orderID + " does not exist.</span>").appendTo(orderInfo);
            }
        }

    })
}
var populateBuyOrderHistory = function (orderTable, buyOrders) {
    orderTable.empty();
    // $(".customers .customerDetailsWrapper .orderCount").text("(" + orders.length + ")");
    buyOrders.forEach(function (order) {
        var newRow = $("<tr></tr>");
        var orderDate = new Date(order.creationDate);
        var orderLink = $(`<td class="text-center"><a class="orderLink" href="orders/${order.buyOrderID}">${order.buyOrderID}</a></td>`);
        buyOrderID = order.buyOrderID;
        orderLink.click(function (event) {
            event.preventDefault();
            console.log(event);
            doAccountDetails("buyorders", order.buyOrderID);
        })
        orderLink.appendTo(newRow);
        $(`<td><span class="text-nowrap">${orderDate.toLocaleDateString()}</span> <span class="text-nowrap">${orderDate.toLocaleTimeString()}</span></td>`).appendTo(newRow);
        $("<td>" + (buyOrderStatusMap[order.status] || order.status) + "</td>").appendTo(newRow);
        $("<td>" + (order.paymentDate ? "Yes" : "No") + "</td>").appendTo(newRow);
        $("<td>" + (order.amount ? "$" + round(order.amount, 2, true) : "") + "</td>").appendTo(newRow);

        newRow.appendTo(orderTable);
    })
}

var getAccountBuyOrders = function (orderID) {
    if (orderID) {
        getAccountBuyOrder(orderID);
    } else {

        $("#account > div").hide();
        $("#buyOrderInfo").empty();
        $("#buyOrderInfoWrapper").hide();
        $("#accountBuyOrderHistory").show();
        $("#buyOrderHistoryTable").show();
        // $("#accountOrderHistory .orderHistory")[0].innerText = "";
        getJSON("getBuyOrders", {}, function (res) {
            var buyOrderHistory = $("#buyOrderHistoryTable .buyOrderHistory");
            buyOrderHistory.empty();
            if (res && res.success) {
                console.log(res.result.orders);
                populateBuyOrderHistory(buyOrderHistory, res.result.buyOrders);
            }
            if (res && res.errors && res.errors.length && res.errors.find(v => v.code == 7)) {
                $("#accountNeedLogin").show();
            }
        })
    }

}
var getAccountCredit = function () {
    $("#account > div").hide();
    $("#accountStoreCredit").show();
    $("#accountStoreCredit .creditHistory")[0].innerText = "";
    getJSON("getStoreCreditHistory", {}, function (res) {
        if (res && res.success) {
            console.log(res.result);
            var creditHistory = $("#accountStoreCredit");

            populateStoreCreditHistory(creditHistory, res.result);
        }
        if (res && res.errors && res.errors.length && res.errors.find(v => v.code == 7)) {
            $("#accountNeedLogin").show();
        }
    })


}
var getAccountPrefs = function () {
    $("#account > div").hide();
    $("#accountPreferences").show();
}

var updateAccountDetails = function () {
    var email = $("#accountEmail").val().trim();
    var firstName = $("#accountFirstName").val().trim();
    var lastName = $("#accountLastName").val().trim();
    var phoneNumber = $("#accountPhoneNumber").val().trim();
    var origEmail = $("#accountEmail").attr("origVal");
    var origFirstName = $("#accountFirstName").attr("origVal");
    var origLastName = $("#accountLastName").attr("origVal");
    var origPhoneNumber = $("#accountPhoneNumber").attr("origVal");

    if (email != origEmail || firstName != origFirstName || lastName != origLastName || phoneNumber != origPhoneNumber) {
        getJSON("updateAccountDetails", { email: email, firstName: firstName, lastName: lastName, phoneNumber: phoneNumber }, function (res) {
            if (res) {
                if (res.success) {
                    $("#accountEmail").attr("origVal", email);
                    $("#accountFirstName").attr("origVal", firstName);
                    $("#accountLastName").attr("origVal", lastName);
                    $("#accountPhoneNumber").attr("origVal", phoneNumber);

                    var data = {
                        UserPoolId: userPoolID,
                        ClientId: appClientID
                    };
                    var userPool = new AmazonCognitoIdentity.CognitoUserPool(data);
                    var cognitoUser = userPool.getCurrentUser();

                    if (cognitoUser != null) {
                        cognitoUser.getSession(function (err, session) {
                            if (err) {
                                // alert(err);
                                return;
                            }
                            console.log('session validity: ' + session.isValid());

                            var attributeList = [];
                            var attribute = new AmazonCognitoIdentity.CognitoUserAttribute({
                                Name: 'family_name',
                                Value: accountLastName.value
                            });
                            attributeList.push(attribute);
                            var attribute = new AmazonCognitoIdentity.CognitoUserAttribute({
                                Name: 'given_name',
                                Value: accountFirstName.value
                            });
                            attributeList.push(attribute);

                            cognitoUser.updateAttributes(attributeList, function (err, result) {
                                if (err) {
                                    // alert(err);
                                    return;
                                }
                                console.log('call result: ' + result);
                            });
                        });
                    }
                } else {
                    if (res.errors && res.errors.length > 0) {
                        messageBox("Error Code " + res.errors[0].code + ": " + res.errors[0].message);
                    } else {
                        messageBox("An error occured.  Please try again.");
                    }
                }
            } else {
                messageBox("An error occured.  Please try again.");
            }
        });
    }

    updatedFields = [];
    for (nextField of $("#accountDetailsUserFields input").toArray()) {
        var thisInput = $(nextField);
        if (thisInput.val().trim() != thisInput.attr("origVal")) {
            updatedFields.push({
                userFieldID: parseInt(thisInput.attr("userFieldID")),
                value: thisInput.val().trim()
            })
        }
        console.log(updatedFields);
    }

    if (updatedFields.length > 0) {
        getJSON("updateUserFields", { userFields: updatedFields }, function (res) {
            if (res && res.success) {
                var accountDetailsUserFields = $("#accountDetailsUserFields input").toArray();
                for (nextInput of accountDetailsUserFields) {
                    $(accountDetailsUserFields).attr("origVal", $(nextInput).val().trim());
                }
            }
        })
    }
}

var checkoutBuyShippingAddressID = 0;
var doCheckoutBuy = function (section, subsection) {
    var state = { checkoutBuy: true, section: section };
    var url = "/store/checkoutBuy/" + section;
    if (subsection) {
        url += "/" + subsection;
        state.subsection = subsection;
    }
    if (doHistory) {
        if (JSON.stringify(history.state) !== JSON.stringify(state)) {
            history.pushState(state, null, url);
            console.log("push");
            console.log(state);
        }
    } else {
        doHistory = true;
        history.replaceState(state, null);
    }
    switchView("checkoutBuy");

    var sections = ["summary", "address", "payment"];
    var sectionI = sections.indexOf(section);

    $(".checkoutTab").removeClass("active");
    $("#checkoutBuyProgress > ol > li:nth-child(" + (sectionI + 1) + ")").addClass("active");
    $(".checkoutTab").removeClass("disabled");
    $("#checkoutBuyProgress > ol > li:nth-child(n+" + (sectionI + 2) + ")").addClass("disabled");

    $(".checkoutTab").removeClass("tabDone");
    $("#checkoutBuyProgress > ol > li:nth-child(-n+" + (sectionI) + ")").addClass("tabDone");

    $("#checkoutBuy > div").removeClass("active");
    $("#checkoutBuy > div:nth-child(" + (sectionI + 1) + ")").addClass("active");

    switch (section) {
        case "summary":
            $("#checkoutBuyCustomerCommentEnable").prop("checked", false).change();
            $("#checkoutBuyCustomerComment").val("");
            break;
        case "address":
            getAddresses();
            addressEditor.appendTo("#checkoutBuyShippingAddressWrapper");
            break;
        case "payment":
            $("#checkoutBuyPaymentInteracAddress").val("");
            $("#checkoutBuyPaymentPayPalAddress").val("");

            if (customizations.buyOrderPaymentMethodModes) {
                if (createBuyOrderMode == "cpm") customizations.buyOrderPaymentMethods = customizations.buyOrderPaymentMethodModes.cpm;
                if (createBuyOrderMode == "regular") customizations.buyOrderPaymentMethods = customizations.buyOrderPaymentMethodModes.regular;
            }
            if (customizations.buyOrderPaymentMethods) {
                $("#paymentBuyTypeStoreCredit").closest("label").toggle(customizations.buyOrderPaymentMethods.includes("storeCredit"));
                $("#paymentBuyTypeInterac").closest("label").toggle(customizations.buyOrderPaymentMethods.includes("interac"));
                $("#paymentBuyTypePayPal").closest("label").toggle(customizations.buyOrderPaymentMethods.includes("paypal"));
                $("#paymentBuyTypeCheque").closest("label").toggle(customizations.buyOrderPaymentMethods.includes("cheque"));
                $("#paymentBuyTypeCheck").closest("label").toggle(customizations.buyOrderPaymentMethods.includes("check"));
                $("#paymentBuyTypeVenmo").closest("label").toggle(customizations.buyOrderPaymentMethods.includes("venmo"));
                $("#paymentBuyTypeZelle").closest("label").toggle(customizations.buyOrderPaymentMethods.includes("zelle"));
                $("#paymentBuyTypeCash").closest("label").toggle(customizations.buyOrderPaymentMethods.includes("cash"));
            }
            if (!customizations.checkoutBuyPaymentPayPalGoodWarning) {
                $("#checkoutBuyPaymentPayPalGoodWarning").remove();
            }


            $("#paymentBuyTypeStoreCredit").closest("label").find("img").attr("src", customizations.smallLogoURL);
            $("#checkoutBuyPayment .paymentTypeSelector input:visible").first().click().change();
            break;
    }
}

var stripeCheckoutNeedsSetup = true;
var stripeCardElement;
var checkoutOrderID = 0;
var checkoutShippingAddressID = 0;
var checkoutShippingAddressDetails = undefined;
var checkoutTimer = undefined;
var doCheckout = function (section, subsection) {
    var state = { checkout: true, section: section };
    var url = "/store/checkout/" + section;
    if (subsection) {
        url += "/" + subsection;
        state.subsection = subsection;
    }
    if (doHistory) {
        if (JSON.stringify(history.state) !== JSON.stringify(state)) {
            history.pushState(state, null, url);
            console.log("push");
            console.log(state);
        }
    } else {
        doHistory = true;
        history.replaceState(state, null);
    }

    switchView("checkout");

    var sections = ["accountLogin", "summary", "informationRequired", "address", "shippingMethod", "payment", "complete"];
    var sectionI = sections.indexOf(section);

    $(".checkoutTab").removeClass("active");
    $("#checkoutProgress > ol > li:nth-child(" + (sectionI + 1) + ")").addClass("active");
    $(".checkoutTab").removeClass("disabled");
    $("#checkoutProgress > ol > li:nth-child(n+" + (sectionI + 2) + ")").addClass("disabled");

    $(".checkoutTab").removeClass("tabDone");
    $("#checkoutProgress > ol > li:nth-child(-n+" + (sectionI) + ")").addClass("tabDone");

    $("#checkout > div").removeClass("active");
    $("#checkout > div:nth-child(" + (sectionI + 1) + ")").addClass("active");

    switch (section) {
        case "accountLogin":
            $("#checkoutLoginEmail").val("");
            $("#checkoutLoginPassword").val("");

            $("#checkoutNoLoginEmail").val("");

            $("#checkoutLoginEmail").css("border-color", "");
            $("#checkoutLoginEmail").closest("label").find(".formError").hide();
            $("#checkoutLoginPassword").css("border-color", "");
            $("#checkoutLoginPassword").closest("label").find(".formError").hide();

            $("#checkoutLoginEmail").focus();
            break;
        case "informationRequired":
            if (userLoggedIn) {
                $("#checkoutInformationRequiredLoading").show();
                $("#checkoutInformationRequiredForm").hide();

                $("#checkout .saveFieldLabel").show();
                getJSON("getAccountUserFields", {}, function (res) {
                    if (res && res.success && res.result && res.result.fields) {
                        var checkoutUserFieldInputs = $("#checkoutInformationRequiredFieldItems input.userFieldTextInput").toArray();
                        for (nextInputField of checkoutUserFieldInputs) {
                            if ($(nextInputField).val().trim() == "") {
                                var thisFieldID = parseInt($(nextInputField).attr("userFieldID"));
                                var thisUserField = res.result.fields.find(v => v.id == thisFieldID && v.value);
                                if (thisUserField) {
                                    $(nextInputField).val(thisUserField.value);
                                    $(nextInputField).closest(".itemRequiredField").find(".saveFieldLabel").remove();
                                }
                            }
                        }

                        //must do these after filling in details to avoid css transition showing
                        $("#checkoutInformationRequiredLoading").hide();
                        $("#checkoutInformationRequiredForm").show();
                        $("#checkout .userFieldTextInput").first().focus();
                    }
                })
            } else {
                $("#checkoutInformationRequiredLoading").hide();
                $("#checkoutInformationRequiredForm").show();
                $("#checkout .userFieldTextInput").first().focus();

                $("#checkout .saveFieldLabel").hide();
            }
            break;
        case "summary":
            if (customizations.creditCardPaymentLogos) {
                $("#paymentIcons").empty();
                for (logo of customizations.creditCardPaymentLogos) {
                    if (logo.startsWith("/payment/")) {
                        logoURL = logo.replace("/payment/", "/external/payment_icons/flat/") + ".svg";
                        $(`<img src="${logoURL}"></img>`).appendTo("#paymentIcons");
                    }

                }
            }
            if (customizations.hideCreditCardPayment) {
                console.log("hide here");
                $("#paymentTypeCard").closest("label").hide();
            }

            $("#checkoutAcceptSummaryForm input").select().focus();
            break;
        case "address":
            getAddresses();
            addressEditor.appendTo("#checkoutShippingAddressWrapper");
            break;
        case "shippingMethod":

            break;
        case "payment":
            getAddresses();

            $("#checkoutPaymentAddressSame").prop("checked", true).change();
            $("#checkoutPaymentAddressSameStripe").prop("checked", true).change();

            $("#applyStoreCreditPayment .storeCreditAvailable").text("Checking...");
            $("#checkoutCreditAmount").prop("disabled", true);
            $("#applyStoreCreditPayment .checkoutApplyStoreCreditBtn").addClass("disabled");

            getJSON("getStoreCreditHistory", {}, function (res) {
                if (res && res.result && res.result.storeCredit !== undefined) {
                    // res.result.storeCredit = 0;
                    $("#applyStoreCreditPayment .storeCreditAvailable").text(parseFloat(res.result.storeCredit).toFixed(2));
                    checkoutCreditMax = res.result.storeCredit;
                    if (res.result.storeCredit > 0) {
                        $("#checkoutCreditAmount").prop("disabled", false);
                        $("#applyStoreCreditPayment .checkoutApplyStoreCreditBtn").removeClass("disabled");

                    }
                }
            });

            addressEditor.appendTo("#checkoutBillingAddressWrapper");
            $("#ccNumber").val("");
            $("#ccNumber").mask("0000-0000-0000-0000", {
                placeholder: "____-____-____-____",
                onComplete: function (cep) {
                    $("#ccExpiry").select().focus();
                }
            });
            $("#ccExpiry").val("");
            $("#ccExpiry").mask("00/00", {
                placeholder: "MM/YY",
                onComplete: function (cep) {
                    $("#ccCVV").select().focus();
                }
            });
            $("#ccCVV").val("");

            $("#checkoutPaymentAddGiftCardWrapper").removeClass("open");
            $("#checkoutPaymentGiftCardCode").val("");
            $("#checkoutPaymentGiftCardCode").mask("AAAAA-AAAAA-AAAAA-AAAAA", {
                placeholder: "_____-_____-_____-_____",
                onComplete: function (cep) {
                    $("#checkoutPaymentGiftCardPIN").select().focus();
                },
            });
            $("#checkoutPaymentGiftCardCode").on("focus", function (event) {
                $("#checkoutPaymentGiftCardCode").select();
            })

            $("#checkoutPaymentGiftCardPIN").val("");
            $("#checkoutPaymentGiftCardPIN").mask("0000", {
                placeholder: "####",
                onComplete: function (cep) {
                    // $("#checkoutPaymentGiftCardPIN").select().focus();
                },
            });
            $("#checkoutPaymentGiftCardPIN").on("focus", function (event) {
                $("#checkoutPaymentGiftCardPIN").select();
            })

            $("#ccPaymentDeclined").hide();
            $("#stripeCCPaymentDeclined").hide();
            $("#paypalPaymentDeclined").hide();

            $("#ccPaymentForm .submitCCBtn").removeClass("disabled");
            $("#ccPaymentForm .submitCCBtn span").hide();

            $("#submitStripeBtn").removeClass("disabled");
            $("#submitStripeBtn span").hide();


            $("#checkoutPayment .paymentTypeSelector input:visible").first().click().change();
            $("#checkout .paypalButtonWrapper").empty();
            $("#checkout .paypalButtonWrapper").show();
            $("#checkout .paypalProcessingWrapper").hide();

            if (paypalClientID) {
                paypal.Buttons({
                    createOrder: function () {
                        //return '107451'; //the order id
                        $("#paypalPaymentDeclined").hide();

                        return new Promise(function (resolve, reject) {
                            getJSON("checkout.makePayment", { paymentType: "paypal", orderID: checkoutOrderID, userFields: getCheckoutUserFields(), customerComment: getCheckoutCustomerComment(), email: userLoggedIn ? undefined : noLoginEmail }, function (res) {
                                if (res && res.result && res.result.paypalOrderID && res.success) {
                                    resolve(res.result.paypalOrderID);
                                } else {
                                    reject("no paypalOrderID");
                                    handleMakePaymentError(res.errors, res.result);

                                }
                            })
                        })
                    },
                    onApprove: function (data, actions) {
                        console.log("onApprove");
                        console.log(data);
                        console.log(actions);
                        console.log(data.orderID);

                        $("#checkout .paypalButtonWrapper").hide();
                        $("#checkout .paypalProcessingWrapper").show();

                        getJSON("checkout.makePayment", { paymentType: "paypalCapture", orderID: checkoutOrderID, userFields: getCheckoutUserFields(), customerComment: getCheckoutCustomerComment(), email: userLoggedIn ? undefined : noLoginEmail, paymentDetails: { paypalOrderID: data.orderID } }, function (res) {
                            if (res && res.result && res.success) {
                                populateOrderDetails("#checkoutPaymentCompleteTable", res.result);
                                doCheckout("complete");
                                gTagPurchase(res.result);
                            } else {
                                handleMakePaymentError(res.errors, res.result);
                            }
                        })
                    },
                    onCancel: function (data, actions) {
                        console.log("onCancel");
                        console.log(data);
                        console.log(actions);
                        $("#paypalPaymentDeclined").show();

                    },
                    onError: function (data, actions) {
                        console.log("onError");
                        console.log(data);
                        console.log(actions);
                        $("#paypalPaymentDeclined").show();

                    },
                    style: {
                        shape: 'pill',
                        height: 40,
                        layout: 'horizontal',
                        fundingicons: 'false',
                        tagline: "false"
                    },

                }).render("#checkout .paypalButtonWrapper");
            }


            if (customizations.stripePublishableKey && Stripe) {
                if (stripeCheckoutNeedsSetup) {
                    stripeCheckoutNeedsSetup = false;

                    var stripe = Stripe(customizations.stripePublishableKey);

                    var elements = stripe.elements();
                    const style = {
                        base: {
                            fontSize: "16px",
                        },
                    };

                    stripeCardElement = elements.create('card', { style, hidePostalCode: true });
                    stripeCardElement.mount('#stripeCardElement');

                    $("#stripeCCPaymentForm").submit(async function (event) {
                        if ($(event.currentTarget).find("button[type='submit']").hasClass("disabled")) return;
                        event.preventDefault();

                        var sameAsShipping = $("#checkoutPaymentAddressSameStripe").prop("checked");
                        var billingAddressDetails = sameAsShipping ? checkoutShippingAddressDetails : addressDropdown[0].selectize.options[selectedAddressID];
                        if (billingAddressDetails) {
                            $("#submitStripeBtn").addClass("disabled");
                            $("#submitStripeBtn span").show();

                            var billingAddressFullName = billingAddressDetails && billingAddressDetails.fullName;
                            var billingAddressPhoneNumber = billingAddressDetails && billingAddressDetails.phoneNumber;
                            var billingAddressCity = billingAddressDetails && billingAddressDetails.city;
                            var billingAddressAddress1 = billingAddressDetails && billingAddressDetails.address1;
                            var billingAddressAddress2 = billingAddressDetails && billingAddressDetails.address2;
                            var billingAddressZipCode = billingAddressDetails && billingAddressDetails.zipCode;
                            var billingAddressState = billingAddressDetails && billingAddressDetails.state;
                            var createPaymentMethod = await stripe.createPaymentMethod({
                                type: 'card',
                                card: stripeCardElement,
                                billing_details: {
                                    name: billingAddressFullName,
                                    email: userLoggedIn && localStorage.ccCurrentUserEmail ? localStorage.ccCurrentUserEmail : noLoginEmail,
                                    phone: billingAddressPhoneNumber,
                                    address: {
                                        city: billingAddressCity,
                                        country: undefined,
                                        line1: billingAddressAddress1,
                                        line2: billingAddressAddress2,
                                        postal_code: billingAddressZipCode,
                                        state: billingAddressState
                                    }
                                },

                            })

                            console.log(createPaymentMethod);
                            if (createPaymentMethod.error) {
                                $("#submitStripeBtn").removeClass("disabled");
                                $("#submitStripeBtn span").hide();
                            } else {
                                getJSON("checkout.makePayment", {
                                    paymentType: "stripe",
                                    orderID: checkoutOrderID,
                                    userFields: getCheckoutUserFields(),
                                    customerComment: getCheckoutCustomerComment(), email: userLoggedIn ? undefined : noLoginEmail,
                                    paymentDetails: {
                                        paymentMethodID: createPaymentMethod.paymentMethod.id
                                    }
                                }, async function (res) {
                                    if (res && res.result && res.result.stripeRequiresAction) {
                                        var handleCardAction = await stripe.handleCardAction(res.result.stripeRequiresAction.paymentIntentClientSecret);
                                        console.log(handleCardAction);
                                        if (handleCardAction.paymentIntent) {
                                            getJSON("checkout.makePayment", { paymentType: "stripeAction", orderID: checkoutOrderID, paymentDetails: { paymentIntentID: handleCardAction.paymentIntent.id }, email: userLoggedIn ? undefined : noLoginEmail }, function (res2) {
                                                $("#submitStripeBtn").removeClass("disabled");
                                                $("#submitStripeBtn span").hide();
                                                if (res2 && res2.result && res2.success) {
                                                    populateOrderDetails("#checkoutPaymentCompleteTable", res2.result);
                                                    doCheckout("complete");
                                                    gTagPurchase(res2.result);
                                                } else {
                                                    handleMakePaymentError(res2.errors, res2.result);
                                                }
                                            })
                                        } else {
                                            $("#submitStripeBtn").removeClass("disabled");
                                            $("#submitStripeBtn span").hide();
                                            stripeCardElement.clear();
                                            stripeCardElement.focus();
                                        }
                                    } else {
                                        $("#submitStripeBtn").removeClass("disabled");
                                        $("#submitStripeBtn span").hide();

                                        if (res && res.result && res.success) {
                                            populateOrderDetails("#checkoutPaymentCompleteTable", res.result);
                                            doCheckout("complete");
                                            gTagPurchase(res.result);
                                        } else {
                                            handleMakePaymentError(res.errors, res.result);
                                        }
                                    }
                                })
                            }
                        }
                    });
                }
                stripeCardElement.clear();
                stripeCardElement.focus();
                addressEditor.appendTo("#checkoutBillingAddressWrapperStripe");


            }
            break;
        case "complete":
            clearInterval(checkoutTimer);
            $(".checkoutTab").addClass("disabled");
            getCarts(false);
            break;
    }
}

var resizeCarousel = function (shouldRedraw) {
    if (!landingCarousel) return;

    var container = $("#landingBestSellersCarousel");
    var containerWidth = container.width();
    var containerHeight = container.height();

    var heightMultiplier = 1.37;
    var maxItemHeight = Math.max(...$("#landingBestSellers .searchResult").toArray().map(v => $(v).height()));

    var targetHeight = (maxItemHeight * heightMultiplier);
    if (containerHeight < targetHeight) {
        containerHeight = container.height(targetHeight).height();
    } else {
        containerHeight = targetHeight;
    }

    landingCarousel.xOrigin = containerWidth / 2;
    landingCarousel.yOrigin = containerHeight / 14;
    landingCarousel.xRadius = containerWidth / 2;
    if (landingCarousel.xRadius > 600) landingCarousel.xRadius = 600;
    landingCarousel.yRadius = containerHeight / 6;

    if (landingCarousel && shouldRedraw && landingCarouselPlaying) landingCarousel.play();

}

var resizeSliders = function () {
    var newWidth = $(".landing.right").outerWidth();
    var newHeight = (newWidth - 12) * 0.37735849; //6px border * 2 = 12px off width, 0.377 = 1:2.65 aspect ratio
    var maxHeight = window.innerHeight * 0.5;
    if (newHeight > maxHeight) newHeight = maxHeight;
    document.documentElement.style.setProperty('--slider-width', newWidth + "px");
    document.documentElement.style.setProperty('--slider-height', newHeight + "px");

    if (landingBannersPlaying) playLandingBanner();
}

var landingCarouselPlaying = false;
var landingBannersPlaying = false;
var landingCarouselProductID;
var landingCarousel;
var landingCarouselTimer;

var playLandingCarousel = function (recreateCarousel) {
    if (landingCarousel && recreateCarousel) {
        landingCarousel.deactivate();
        landingCarousel = undefined;
    }
    if (landingCarousel) {
        if (!landingCarouselTimer) landingCarouselTimer = setTimeout(function () {
            landingCarouselTimer = undefined;
            landingCarousel.play();

            landingCarousel.enableAutoPlay();
            landingCarousel.bindControls();
        }, 50)
    } else {
        landingCarousel = $("#landingBestSellersCarousel").Cloud9Carousel({
            autoPlay: 1,
            bringToFront: true,
            itemClass: "carouselCard",
            frontItemClass: "frontCard",
            onLoaded: function (carousel) {
                resizeCarousel();
                $("#landingBestSellersCarousel .searchResult").css("visibility", "");

            },
        }).data("carousel");

        if (!recreateCarousel) $("#landingBestSellersDropdown").change(function (event) {
            var newProductID = $("#landingBestSellersDropdown").val();
            if (newProductID != landingCarouselProductID) {
                getJSON("getBestSellers", { productTypeID: newProductID }, function (res) {
                    if (res && res.result) {
                        populateBestSellers(res.result);
                        playLandingCarousel(true);
                    }
                })
            }
            $("#landingBestSellersDropdown").val("default");
        })

    }
    landingCarouselPlaying = true;
    resizeCarousel();
}

var pauseLandingCarousel = function () {
    if (landingCarousel) landingCarousel.deactivate();
    landingCarouselPlaying = false;
}

var playLandingBanner = function () {
    landingBannersPlaying = true;
    var slider = $(".landing.right .tab-pane.active .slider");
    if (!slider.hasClass("slick-initialized")) {
        slider.slick({
            dots: true,
            arrows: false,
            infinite: true,
            speed: 750,
            fade: true,
            cssEase: 'linear',
            autoplay: true,
            autoplaySpeed: 5000,
            // lazyLoad: 'ondemand',
            slidesToShow: 1,
            slidesToScroll: 1,
            // adaptiveHeight: true
        })
    } else {
        slider.slick("slickPlay");
        // slider.slick("slickSetOption", "autoplaySpeed", 5000, true);
        slider.slick("setPosition");
    }
}

var pauseLandingBanners = function () {
    landingBannersPlaying = false;
    var sliders = $(".landing.right .slider.slick-initialized");
    sliders.slick("slickPause");
}

var styleLandingBanner = function (landingBannerStyle) {
    if (landingBannerStyle && landingBannerStyle.order) {
        for (nextOrder of landingBannerStyle.order) {
            var foundLink = $(`#landingTabs .nav-link[href='#${nextOrder}']`);
            foundLink.closest(".nav-item").appendTo("#landingTabs");
        }
        $("#landingTabs > .nav-item > .nav-link").first().click();

    }
}

var upcomingEventsImageURL = "";
var populateLandingBanners = function (banners) {
    var foundUpcomingEvents = false;
    if (banners) {
        var bannerTypes = [];
        banners.forEach(function (banner) {
            if (banner.type == "upcomingEvents") {
                foundUpcomingEvents = true;
                upcomingEventsImageURL = banner.image;
                $("#upcomingEventsLink").attr("href", upcomingEventsImageURL);
            } else {
                var url = "/store/category/"
                if (banner.item) {
                    url += categories[banner.item.categoryID] + "/item/" + banner.item.inventoryID + "/" + banner.item.name
                }
                if (banner.bundle) {
                    url = "store/bundle/" + banner.bundle.bundleID
                }
                if (banner.category) {
                    url += categories[banner.category.categoryID];
                }
                if (banner.sale) {
                    url = "store/sale/" + banner.sale.saleID + "/" + banner.sale.name
                }
                if (banner.page) {
                    url = "store/pages/" + banner.page.name;
                }
                var newA = $('<a href="' + url + '"><img class="lazyload" data-src="' + banner.image + '" /><img class="lazyload" data-src="' + banner.image + '" /></a>');
                newA.click(function (event) {
                    event.preventDefault();
                    console.log(banner);
                    if (banner.sale) {
                        loadSearch(banner.sale.name, false, banner.sale.saleID);
                    } else if (banner.item) {
                        viewItemDetails(banner.item.inventoryID, banner.item.category, banner.item.name);
                    } else if (banner.bundle) {
                        viewBundleDetails(banner.bundle.bundleID);
                    } else if (banner.category) {
                        loadSearch(categories[banner.category.categoryID], true);
                    } else if (banner.page) {
                        doPages(banner.page.name);
                    }
                })

                newA.appendTo("#" + banner.type + " .slider");
                bannerTypes.push(banner.type);
            }
        })
        console.log(bannerTypes);
        if (!bannerTypes.includes("magic")) $("#magic-tab").closest(".nav-item").remove();
        if (!bannerTypes.includes("pokemon")) $("#pokemon-tab").closest(".nav-item").remove();
        if (!bannerTypes.includes("vanguard")) $("#vanguard-tab").closest(".nav-item").remove();
        if (!bannerTypes.includes("ufs")) $("#ufs-tab").closest(".nav-item").remove();
    }
    if (!foundUpcomingEvents) {
        $("#upcomingEventsLink").remove();
    }
}

var populateBestSellers = function (bestSellers) {
    $("#landingBestSellersCarousel").empty();
    var listings = [...bestSellers.listings];
    listings.reverse();
    var firstListing = listings.pop();
    if (firstListing) listings.unshift(firstListing);

    for (result of listings) {
        var newResult = createNewResult(result, false, false, false);
        newResult.find("img").on("load", function (event) {
            resizeCarousel();
        })
        newResult.css("visibility", "hidden");
        var newCard = $(`<div class="carouselCard"></div>`).append(newResult);
        newCard.appendTo("#landingBestSellersCarousel");
    }

    var currentOptions = $("#landingBestSellersDropdown option").toArray();
    currentOptions.shift();
    $(currentOptions).remove();

    for (productType of productTypes) {
        $(`<option value="${productType.id}">&nbsp;${productType.name}</option>`).appendTo("#landingBestSellersDropdown");
    }

    landingCarouselProductID = bestSellers.productTypeID;

}

var handleMakePaymentError = function (errors, order) {
    if (errors.length) {
        error = errors[0];
        if (error.code == 31) {
            //insufficiant store credit
            messageBox("You no longer have enough store credit to complete this transaction.  Please adjust the credit applied and try again.");
            doCheckout("payment");
            $("#checkoutCreditAmount").val(round(0, 2, true));
            $("#applyStoreCreditPayment").submit()
        } else if (error.code == 35) {
            //35 (all items are out of stock)
            messageBox("Required stock for items in this order is no longer available.  No payment has been made.  Returning to your cart.");
            doCart();
        } else if (error.code == 36) {
            //36 (some items out of stock)
            populateOrderDetails($("#checkoutPaymentOrderInfoWrapper"), order);
            $("#checkoutCreditAmount").val(round(order.storeCreditApplied, 2, true));

            var missingItems = $("#checkoutPaymentMissingWarningItems");
            missingItems.empty();
            if (error.itemsMissing && error.itemsMissing.length) {
                for (item of error.itemsMissing) {
                    var newRemovedItem = $(`<div>${item.quantityRemoved}x ${item.name}</div>`);
                    newRemovedItem.appendTo(missingItems);
                }
                $("#checkoutPaymentMissingWarning").show();
            }
            var removedItems = $("#checkoutPaymentRemovedWarningItems");
            removedItems.empty();
            if (error.itemsRemoved && error.itemsRemoved.length) {
                for (item of error.itemsRemoved) {
                    var newRemovedItem = $(`<div>${item.quantityRemoved}x ${item.name}</div>`);
                    newRemovedItem.appendTo(removedItems);
                }
                $("#checkoutPaymentRemovedWarning").show();
            }
            messageBox("Some items are now out of stock.  No payment has been made, and applied credit has been reset.<br>Please review your order and submit payment again.");
        } else if (error.code == 45) {
            //authorize.net payment declined
            $("#ccPaymentDeclined").show();
        } else if (error.code == 88) {
            //authorize.net payment declined
            $("#stripeCCPaymentDeclined").show();
        } else if (error.code == 102) {
            //bundle or coupon has changed due to stock missing, returning to cart
            messageBox("A bundle or coupon is no longer available.  Returning to your cart.  Please try again.");
            doCart();
        } else {
            //other error, internal error
            messageBox("An internal payment error has occured.  Returning to your cart.  Please try again.");
            doCart();
        }
    }
}

var contentLinkHandler = function (event) {
    if (customizations.storeDomain) {
        var linkURL = $(event.currentTarget).attr("href");
        if (linkURL) {
            linkURL = linkURL.replace("http://", "").replace("https://", "");
            var linkParts = linkURL.split("/");
            if (linkParts[0] == "") linkParts[0] = "/";
            if (linkParts[0] == "/" || linkParts[0] == customizations.storeDomain || linkParts[0] == "www." + customizations.storeDomain) {
                console.log(linkURL);
                linkParts.splice(0, 1);
                linkURL = "/" + linkParts.join("/");
                console.log(linkURL);
                // window.location.pathname = linkURL;
                history.pushState(undefined, null, linkURL);
                loadStorePath();

                event.preventDefault();
            }
        }
    }
}

var pagesSetup = false;
var doPages = function (section) {
    var state = { pages: true, section: section };
    var url = "/store/pages/" + section;
    if (doHistory) {
        if (JSON.stringify(history.state) !== JSON.stringify(state)) {
            history.pushState(state, null, url);
            console.log("push");
            console.log(state);
        }
    } else {
        doHistory = true;
        history.replaceState(state, null);
    }

    switchView("pages");
    document.title = section + " - " + customizations.title;

    for (page of customizations.pages) {
        if (page.name == section) {
            $("#pages").html(page.html);
            $("#rightHeader .pages .pageName").text(page.name);
            break;
        }
    }
    // $("#pages > div").hide();
    if (!pagesSetup) {
        pagesSetup = true;
        $("#pages").on("click", "a", contentLinkHandler);
    }
}

var doAccountDetails = function (section, subsection) {
    var state = { account: true, section: section };
    var url = "/store/account/" + section;
    if (subsection) {
        url += "/" + subsection;
        state.subsection = subsection;
    }
    if (doHistory) {
        if (JSON.stringify(history.state) !== JSON.stringify(state)) {
            history.pushState(state, null, url);
            console.log("push");
            console.log(state);
        }
    } else {
        doHistory = true;
        history.replaceState(state, null);
    }

    switchView("account");
    $("#account > div").hide();
    var sections = ["user", "addresses", "orders", "credit", "buyorders", "prefs"]
    var sectionI = sections.indexOf(section);

    $(".accountTab").removeClass("active");
    $("#accountDetails > ol > li:nth-child(" + (sectionI + 1) + ")").addClass("active");
    switch (section) {
        case "user":
            getAccountDetails();
            $("#currentPassword").val("");
            $("#newPassword").val("");

            $("#accountUserDetails input").css("border-color", "");
            $("#accountUserDetails .formError").hide();

            break;
        case "addresses":
            getAccountAddresses();
            break;
        case "orders":
            getAccountOrders(subsection);
            break;
        case "buyorders":
            getAccountBuyOrders(subsection);
            break;
        case "credit":
            getAccountCredit();
            break;
        case "prefs":
            getAccountPrefs();
            break;
        default:
        // code block
        // 
    }
}
function chunkArrayInGroups(arr, size) {
    var myArray = [];
    for (var i = 0; i < arr.length; i += size) {
        myArray.push(arr.slice(i, i + size));
    }
    return myArray;
}

var resetBundleState = function (target, resetImage) {
    if (resetImage) {
        var prodImage = $(target).closest(".searchResult").find(".prodImage");
        prodImage.attr("src", prodImage.attr("data-src"));
    }
    var bundleGroups = $(target).closest(".searchResult").find(".bundleGroup").toArray();
    var requiredMissing = 0;
    var bundleAddLines = $(target).closest(".searchResult").find(".bundleAddLines");
    bundleAddLines.empty();
    var bundleAddPrices = $(target).closest(".searchResult").find(".bundleAddPrices");
    bundleAddPrices.empty();
    for (bundleGroup of bundleGroups) {
        var bundleGroupData = $(bundleGroup).data();
        var selectedBundleItem = $(bundleGroup).find(".bundleItem.selected");
        var selectedBundleData = selectedBundleItem.data();
        var selectionText = "None";
        if (selectedBundleData && selectedBundleData.inventoryName) {
            selectionText = selectedBundleData.inventoryName;
            $(bundleGroup).find(".bundleItemSelectionRequired").hide();
            var newBundleAddLine = resOrigParts.bundleAddLine.clone(true);
            newBundleAddLine.text(`${selectedBundleData.inventoryName}:`);
            newBundleAddLine.appendTo(bundleAddLines);

            var newBundleAddPrice = resOrigParts.bundleAddPrice.clone(true);
            newBundleAddPrice.text(`${selectedBundleData.displayPrice}`);
            newBundleAddPrice.appendTo(bundleAddPrices);


        } else {
            var isRequired = !bundleGroupData.optional;
            if (isRequired) requiredMissing++;
            $(bundleGroup).find(".bundleItemSelectionRequired").toggle(isRequired);

        }
        $(bundleGroup).find(".bundleItemSelection").text(selectionText);

        // var selectedBundleItemName = selectedBundleItem.data()
    }

    if (requiredMissing) {
        var newBundleAddLine = resOrigParts.bundleAddLine.clone(true);
        newBundleAddLine.addClass("selectionsRemaining");
        newBundleAddLine.text(`${requiredMissing} Selections Remaining`);
        newBundleAddLine.appendTo(bundleAddLines);

        var newBundleAddPrice = resOrigParts.bundleAddPrice.clone(true);
        newBundleAddPrice.text(``); //blank one for vertical spacing
        newBundleAddPrice.appendTo(bundleAddPrices);
    }
    $(target).closest(".searchResult").find(".bundleAddBtn").toggleClass("disabled", !!requiredMissing);
}


var resOrig;
var resOrigParts = {};
var createNewResult = function (result, isDetailView, isCategory, isMini, isBundle) {
    if (resOrig === undefined) {
        resOrig = $(".searchResult.hidden");
        resOrig.detach();
        resOrig.removeClass("hidden");

        // resEmpty.find(".searchResultLeftMiddle").remove();
        resOrigParts.searchResultLeftBottom = resOrig.find(".searchResultLeftBottom").detach();
        resOrigParts.fields = resOrig.find(".fields").detach();

        resOrigParts.bundleInfo = resOrig.find(".bundleInfo").detach();
        resOrigParts.bundleGroup = resOrigParts.bundleInfo.find(".bundleGroup").detach();
        resOrigParts.bundleItem = resOrigParts.bundleGroup.find(".bundleItem").detach();

        resOrigParts.bundleItem.hover(function (event) {
            var itemData = $(event.target).closest(".bundleItem").data();
            $(event.target).closest(".bundleGroup").find(".bundleItemSelection").text(itemData.inventoryName);
            $(event.target).closest(".searchResult").find(".prodImageWrapper").find(".prodImage").attr("src", constructProductImageURL(itemData.image));
            $(event.target).closest(".bundleGroup").find(".bundleItemSelectionRequired").hide();

        }, function (event) {
            resetBundleState(event.target, false);
        })

        resOrigParts.bundleItem.click(function (event) {
            if ($(event.currentTarget).hasClass("bundleItemOutOfStock")) return;
            console.log("click");
            $(event.target).closest(".bundleGroup").find(".bundleItem").removeClass("selected");
            $(event.target).closest(".bundleItem").addClass("selected").removeClass("disabled");

            var thisBundleGroup = $(event.target).closest(".bundleGroup");
            var bundleItemDefinitionID = thisBundleGroup.data("bundleItemDefinitionID");
            var thisBundleItemPrice = $(event.target).closest(".bundleItem").data("origPrice");
            console.log(thisBundleItemPrice);

            var nextBundleGroup = thisBundleGroup.next(".bundleGroup");
            while (nextBundleGroup.length) {
                var nextBundleGroupData = nextBundleGroup.data();
                if (nextBundleGroupData.bundleItemDefinitionID == bundleItemDefinitionID) {
                    var nextBundleItems = nextBundleGroup.find(".bundleItem").toArray();
                    for (nextBundleItem of nextBundleItems) {
                        nextBundleItem = $(nextBundleItem);
                        nextBundleItemData = nextBundleItem.data();
                        if (thisBundleItemPrice < nextBundleItemData.origPrice) {
                            nextBundleItem.addClass("disabled");
                        } else {
                            nextBundleItem.removeClass("disabled");
                        }
                    }
                    console.log(nextBundleGroup);

                }
                nextBundleGroup = nextBundleGroup.next(".bundleGroup");
            }

            var nextBundleGroup = thisBundleGroup.prev(".bundleGroup");
            while (nextBundleGroup.length) {
                var nextBundleGroupData = nextBundleGroup.data();
                if (nextBundleGroupData.bundleItemDefinitionID == bundleItemDefinitionID) {
                    var nextBundleItems = nextBundleGroup.find(".bundleItem").toArray();
                    for (nextBundleItem of nextBundleItems) {
                        nextBundleItem = $(nextBundleItem);
                        nextBundleItemData = nextBundleItem.data();
                        if (thisBundleItemPrice > nextBundleItemData.origPrice) {
                            nextBundleItem.addClass("disabled");
                        } else {
                            nextBundleItem.removeClass("disabled");
                        }
                    }
                    console.log(nextBundleGroup);

                }
                nextBundleGroup = nextBundleGroup.prev(".bundleGroup");
            }

            $(event.target).closest(".bundleItemsList").find(".bundleItem.disabled").removeClass("selected");

            resetBundleState(event.target);
        })

        resOrigParts.bundleAdd = resOrig.find(".bundleAdd").detach();
        resOrigParts.bundleAdd.find(".bundleAddBtn").click(function (event) {
            if ($(event.target).hasClass("disabled")) return;
            console.log("add here");
            var selectedItems = $(event.target).closest(".searchResult").find(".bundleItem.selected");
            console.log(selectedItems.length);
            var bundleItems = [];
            for (selectedItem of selectedItems) {
                var selectedItemData = $(selectedItem).data();
                if (selectedItemData && selectedItemData.inventoryID) {
                    var bundleGroup = $(selectedItem).closest(".bundleGroup");
                    var bundleGroupData = bundleGroup.data();
                    console.log("bundle group");
                    console.log(bundleGroupData);
                    console.log("item");
                    console.log(selectedItemData);
                    bundleItems.push({
                        bundleItemID: bundleGroupData.bundleItemID,
                        inventoryVariantID: selectedItemData.displayVariantID
                    })
                }
            }
            var bundleData = $(event.target).closest(".searchResult").find(".bundleInfo").data();
            console.log(bundleData);
            window.setTimeout(function () {
                // fakeProdImage.remove();
                // if (shouldAnimateIncCart) 
                incCartQty(1, false);
            }, 800);
            $(event.target).closest(".searchResult").find(".bundleItem.selected").removeClass("selected");
            $(event.target).closest(".searchResult").find(".bundleItem.disabled").removeClass("disabled");
            $(event.target).closest(".searchResult").find(".bundleItem.noneSelection").addClass("selected");
            resetBundleState(event.target);
            getJSON("addBundleToCart", { cartID: defaultCartID, bundleID: bundleData.bundleID, bundleItems: bundleItems }, function (res) {

            })


        })
        resOrigParts.bundleAddLine = resOrigParts.bundleAdd.find(".bundleAddLine").detach();
        resOrigParts.bundleAddPrice = resOrigParts.bundleAdd.find(".bundleAddPrice").detach();

        resOrigParts.variant = resOrig.find(".variants .variant.hidden").detach();
        resOrigParts.variant.removeClass("hidden");
        resOrigParts.variants = resOrig.find(".variants").detach();

        resOrigParts.foilOverlay = resOrig.find(".foilOverlay").detach();
        resOrigParts.onSale = resOrig.find(".onSale").detach();
        resOrigParts.outOfStock = resOrig.find(".outOfStock").detach();
        resOrigParts.onlineOnly = resOrig.find(".onlineOnly").detach();
        resOrigParts.domesticOnly = resOrig.find(".domesticOnly").detach();
        resOrigParts.domesticOnly.text(`${storeCountry} Only`);
        resOrigParts.inStorePickupOnly = resOrig.find(".inStorePickupOnly").detach();

        resOrigParts.languageTag = resOrig.find(".languageTag").detach();
        resOrigParts.sellTag = resOrig.find(".prodBuyListBanner").detach();

        resOrigParts.releaseDate = resOrig.find(".prodReleaseDateWrapper").detach();
        resOrigParts.purchaseLimit = resOrig.find(".prodPurchaseLimit").detach();
    }
    var newResult = resOrig.clone(true);

    newResult.data("resData", result);
    newResult.find(".prodName").text(result.inventoryName);


    var newResultProdImage = newResult.find(".prodImage");
    newResultProdImage.attr("data-src", constructProductImageURL(result.image, true));
    newResultProdImage.attr("alt", result.inventoryName);

    if (isMini && result.buyPrice) newResult.addClass("buyList");

    newResultProdImage.on("lazybeforeunveil", function (event) {
        newResult.append(resOrigParts.searchResultLeftBottom.clone(true));
        newResult.append(resOrigParts.variants.clone(true));

        if (isDetailView && result.buyPrice) {
            var newSellTag = resOrigParts.sellTag.clone(true);
            newResult.find(".searchResultLeftTop").append(newSellTag);
        }

        var cardLanguage = (result.filterFields && result.filterFields["Language"]);
        if (!cardLanguage) {
            cardLanguage = result.fields && result.fields.find(v => v.name == "Language");
            cardLanguage = cardLanguage ? cardLanguage.value : undefined;
        }
        if (cardLanguage) {
            var langShort = languageMap[cardLanguage];
            if (langShort != "EN") {
                var newLanguageTag = resOrigParts.languageTag.clone(true);
                newLanguageTag.text(langShort).attr("title", cardLanguage);
                newResult.find(".prodDetails").append(newLanguageTag);

                var newInventoryName = result.inventoryName;
                if (newInventoryName.includes(" (" + langShort + ", ")) {
                    newInventoryName = newInventoryName.replace(langShort + ", ", "");

                } else {
                    newInventoryName = newInventoryName.replace(" (" + langShort + ")", "");
                }
                newResult.find(".prodName").text(newInventoryName);

                if (isDetailView) {
                    newLanguageTag.append(`<div class="bottomRightSwoop"></div>`);
                }
            }
        }

        if (isDetailView) {
            newResult.find(".searchResultLeftTop").removeAttr("href");

            newResult.find(".searchResultLeftMiddle").append(`<div class="bottomRightSwoop"></div>`);
        } else {
            var url;
            if (isBundle) {
                url = "/store/category/" + result.categoryName + "/bundle/" + result.id + "/" + result.name.replaceAll(" ", "_");
            } else {
                url = "/store/category/" + result.categoryName + "/item/" + result.inventoryID + "/" + result.inventoryName.replaceAll(" ", "_");
            }

            url = encodeURI(url);
            newResult.find(".searchResultLeftTop").attr("href", url);
            newResult.find(".prodDetailsBtn").attr("href", url);
        }

        if (isCategory || isMini) {
            newResult.find(".prodCat").css("display", "none");
        } else {
            newResult.find(".prodCat").text(result.categoryName);
        }

        if (result.releaseDate && !isMini) {
            var releaseDateWrapper = resOrigParts.releaseDate.clone(true);
            var releaseDate = new Date(result.releaseDate);
            var releaseDateString = shortMonths[releaseDate.getMonth()] + " " + releaseDate.getDate() + nth(releaseDate.getDate());
            releaseDateWrapper.find(".prodReleaseDate").text(releaseDateString);
            newResult.find(".prodDetails").append(releaseDateWrapper);
        }
        if (result.userCheckoutQuantityLimit) {
            var purchaseLimit = resOrigParts.purchaseLimit.clone(true);
            var limitText = limitToLimitText(result.userCheckoutQuantityLimit, result.userCheckoutQuantityLimitResetMinutes);
            purchaseLimit.text(limitText);
            newResult.find(".prodDetails").append(purchaseLimit);
        }

        if (!isBundle) {
            var defaultVariant = result.variants.find(variant => variant.default);
            var firstStockVariant = result.variants.find(variant => variant.quantity > 0);

            if (defaultVariant && defaultVariant.regularPrice) {
                newResultProdImage.after(resOrigParts.onSale.clone(true));
                if (isMini) newResult.css("order", -1);
            }
            if (!firstStockVariant) {
                newResultProdImage.after(resOrigParts.outOfStock.clone(true));

                newResult.find(".quickAddBtn").addClass("fa-star");
                newResult.find(".quickAddBtn").removeClass("fa-shopping-cart");
                newResult.find(".onSale").remove();

                if (isMini) newResult.css("order", 1);
            }
            if (result.inStorePickupOnly) newResultProdImage.after(resOrigParts.inStorePickupOnly.clone(true));
            if (result.onlineOnly) newResultProdImage.after(resOrigParts.onlineOnly.clone(true));
            if (result.domesticOnly) newResultProdImage.after(resOrigParts.domesticOnly.clone(true));

            if (defaultVariant.quantity < 1 && firstStockVariant) defaultVariant = firstStockVariant;
            var priceShow = round(defaultVariant.price, 2, true);

            newResult.find(".quickAddBtn").data("variant", defaultVariant);
            newResult.find(".quickAddBuyBtn").data("variant", defaultVariant);
            newResult.find(".quickAddBuyBtn").data("inventoryID", result.inventoryID);
            if (result.buyCPM) newResult.find(".quickAddBuyBtn").data("buyCPM", true);

            newResult.find(".prodPrice").first().text("$" + priceShow);
            if (defaultVariant.regularPrice) {
                newResult.find(".prodRegularPrice").first().text("$" + round(defaultVariant.regularPrice, 2, true)).css("display", "inline");

                var salePerc = 100 * (1 - (defaultVariant.price / defaultVariant.regularPrice));
                salePerc = Math.trunc(salePerc + 0.1);
                newResult.find(".prodSalePerc").first().text(`${salePerc}% Off`).css("display", isMini ? "block" : "inline");
            }

            if (result.buyPrice) {
                var dispBuyPrice = "$" + round(result.buyPrice, 2, true);
                if (result.buyCPM) {
                    dispBuyPrice = dispBuyPrice + `<span class="prodBuyCPM">/1000</span>`;
                    var dispUnitPrice = round(result.buyPrice / 10, 1, false);
                    if (dispUnitPrice >= 100) {
                        dispUnitPrice = round(result.buyPrice / 1000, 2, true);
                        dispBuyPrice = `$${dispUnitPrice} <span class="prodBuyCPM">each</span><br>` + dispBuyPrice;
                    } else {
                        dispBuyPrice = `${dispUnitPrice}&#162; <span class="prodBuyCPM">each</span><br>` + dispBuyPrice;
                    }
                }
                if (result.isBulk) dispBuyPrice = dispBuyPrice + " - Bulk";
                newResult.find(".prodBuyPrice").html(dispBuyPrice);
            } else {
                newResult.find(".prodBuyPrice").html("");
            }
        } else {
            var priceShow = "";
            if (result.price) {
                priceShow = round(result.price, 2, true, true, true);
            } else {
                priceShow = `${round(result.priceRangeMin, 2, true, true, true)} - ${round(result.priceRangeMax, 2, true, true, true)}`;
            }

            newResult.find(".prodPrice").first().text(priceShow);
            newResult.find(".quickAddBtn").remove();
            newResult.addClass("bundle");
        }
        if (!isMini && !isBundle) {
            if (result.fields || (result.notes && result.notes.length > 0)) {
                newResult.append(resOrigParts.fields.clone(true));
                var newResultFields = newResult.find(".fields");

                if (result.notes && result.notes.length > 0) {
                    var inventoryNotesWrapper = $(`<div class="inventoryNotes"></div>`);
                    var inventoryNotes = [];
                    for (nextNote of result.notes) {
                        inventoryNotes.push(`<div class="inventoryNote">${nextNote.text}</div>`);
                    }
                    $(inventoryNotes.join("<hr>")).appendTo(inventoryNotesWrapper);
                    inventoryNotesWrapper.appendTo(newResultFields);
                }
                if (result.fields) {
                    for (nextField of result.fields) {

                        var nextFieldValue = "" + nextField.value;
                        nextFieldValue = nextFieldValue.replace(/\r\n?|\n/g, '<br />');

                        var mtgReplacements = ["W", "U", "B", "R", "G",
                            "C", "X", "0", "S", "M",
                            "1", "2", "3", "4", "5", "6", "7", "8", "9", "10",
                            "11", "12", "13", "14", "15", "16", "17", "18", "19", "20",
                            "2/W", "2/U", "2/B", "2/R", "2/G",
                            "W/U", "W/B", "U/B", "U/R", "B/R", "B/G", "R/G", "R/W", "G/W", "G/U",
                            "W/P", "U/P", "B/P", "R/P", "G/P", "H",
                            "T", "Q", "P",
                            "Y", "Z", "\u00bd", "100", "1000000", "\u221e", "HW", "HR"];
                        for (replacement of mtgReplacements) {
                            if (!nextFieldValue.includes("{")) break;
                            nextFieldValue = nextFieldValue.replaceAll("{" + replacement + "}", '<img class="mtgIcons" src="https://conduct-catalog-images.s3-us-west-2.amazonaws.com/extra/mtgIcons/' + replacement.replaceAll("/", "") + '.svg">');
                        }

                        $('<div class="fieldName">' + nextField.name + '</div>').appendTo(newResultFields);
                        $('<div class="fieldValue">' + nextFieldValue + '&nbsp;</div>').appendTo(newResultFields);
                    };
                }
            };

            var newVariants = [];
            for (nextVariant of result.variants) {
                if (nextVariant.quantity > 0 || nextVariant.default) {
                    var newVariant = resOrigParts.variant.clone(true);
                    newVariant.data("variant", nextVariant);

                    newVariant.find(".condition")[0].innerText = nextVariant.name;
                    newVariant.find(".price").text("$" + parseFloat(nextVariant.price).toFixed(2));
                    if (nextVariant.regularPrice) {
                        newVariant.find(".prodRegularPrice").text("$" + round(nextVariant.regularPrice, 2, true)).css("display", "inline");

                        var salePerc = 100 * (1 - (nextVariant.price / nextVariant.regularPrice));
                        salePerc = Math.trunc(salePerc + 0.1);
                        newVariant.find(".prodSalePerc").first().text(`${salePerc}% Off`).css("display", "inline");
                    }
                    newVariant.find(".stock")[0].innerText = "Stock: " + nextVariant.quantity;
                    if (nextVariant.quantity == 0) {
                        newVariant.find(".btnAddCart")[0].innerText = "Wishlist"
                    }
                    newVariant.removeClass("hidden");
                    newVariants.push(newVariant);
                }
            };

            if (result.buyPrice > 0) {
                var newVariant = resOrigParts.variant.clone(true);
                newVariant.data("variant", nextVariant);
                newVariant.data("inventoryID", result.inventoryID);
                newVariant.addClass("buyList");

                newVariant.find(".condition").text("Sell Price");
                var dispBuyPrice = "$" + round(result.buyPrice, 2, true);
                if (result.isBulk) dispBuyPrice = dispBuyPrice + " - Bulk";
                if (result.buyCPM) {
                    dispBuyPrice = dispBuyPrice + `<span class="prodBuyCPM">/1000</span>`;
                    var dispUnitPrice = round(result.buyPrice / 10, 1, false);
                    if (dispUnitPrice >= 100) {
                        dispUnitPrice = round(result.buyPrice / 1000, 2, true);
                        dispBuyPrice = `$${dispUnitPrice} <span class="prodBuyCPM">each</span><br>` + dispBuyPrice;
                    } else {
                        dispBuyPrice = `${dispUnitPrice}&#162; <span class="prodBuyCPM">each</span><br>` + dispBuyPrice;
                    }

                    newVariant.find(".quantity").attr("max", "").attr("min", "0").attr("step", "1000").val("1000");
                }
                newVariant.find(".price").html(dispBuyPrice);

                var limitText = "";
                if (result.buyTargetRemaining) limitText = "Limit: " + result.buyTargetRemaining;
                newVariant.find(".stock").text(limitText);
                newVariant.find(".btnAddCart").text("Sell This");
                newVariant.removeClass("hidden");

                newVariants.push(newVariant);
            }
            newResult.find(".variants").append(newVariants);

        }
        if (isBundle && isDetailView) {
            var newResultBundleInfo = resOrigParts.bundleInfo.clone(true);
            newResultBundleInfo.data(result);
            newResult.append(newResultBundleInfo);

            if (result.description) newResultBundleInfo.find(".bundleDescription").html(result.description);
            // resOrigParts.bundleGroup

            for (bundleItem of result.bundleItems) {
                var newBundleGroup = resOrigParts.bundleGroup.clone(true);
                newBundleGroup.data(bundleItem);
                var newBundleItems = newBundleGroup.find(".bundleItems");
                var bundleDef = result.bundleItemDefinitions.find(v => v.bundleItemDefinitionID == bundleItem.bundleItemDefinitionID);

                var itemTitle = bundleDef.name;
                if (bundleItem.label) itemTitle = `${itemTitle}: ${bundleItem.label}`;

                if (bundleItem.optional) {
                    var newBundleItemNone = resOrigParts.bundleItem.clone(true);
                    newBundleItemNone.addClass("noneSelection");
                    newBundleItemNone.addClass("selected");
                    newBundleItemNone.find("img").remove();
                    $(`<i class="far fa-ban"></i>`).prependTo(newBundleItemNone);
                    newBundleItemNone.find(".prodPrice").text("None");
                    newBundleItemNone.find(".prodRegularPrice").remove();
                    newBundleItemNone.appendTo(newBundleItems);
                }
                newBundleGroup.find(".bundleItemName").text(itemTitle);
                for (listing of bundleDef.listings) {
                    var newBundleItem = resOrigParts.bundleItem.clone(true);
                    newBundleItem.find("img").attr("src", constructProductImageURL(listing.image));

                    var defaultVariant = listing.variants.find(v => v.default);
                    var itemPrice = defaultVariant.price;
                    var discountPrice = itemPrice * bundleItem.priceMultiplier;
                    if (bundleItem.price) discountPrice = bundleItem.price;

                    listing.origPrice = itemPrice;
                    if (discountPrice == itemPrice) {
                        listing.displayPrice = round(itemPrice, 2, true, true, true);
                        newBundleItem.find(".prodPrice").text(listing.displayPrice);
                        newBundleItem.find(".prodRegularPrice").remove();
                    } else {
                        listing.displayPrice = round(discountPrice, 2, true, true, true);
                        newBundleItem.find(".prodPrice").text(listing.displayPrice);
                        newBundleItem.find(".prodRegularPrice").text(round(itemPrice, 2, true, true, true));

                    }
                    if (defaultVariant.quantity < 1) {
                        newBundleItem.addClass("bundleItemOutOfStock");
                        newBundleItem.find(".prodRegularPrice").remove();
                        newBundleItem.find(".prodPrice").html("Out of<br>Stock");

                    }
                    listing.displayVariantID = defaultVariant.id;
                    newBundleItem.data(listing);
                    newBundleItem.appendTo(newBundleItems);
                }

                newResultBundleInfo.find(".bundleItemsList").append(newBundleGroup);
                // newBundleGroup.appendTo("#bundleItemsList");

            }

            newResult.find(".variants").append(resOrigParts.bundleAdd.clone(true));

            resetBundleState(newResultBundleInfo);
        }

        if (!isBundle) {
            var inventoryNameParts = result.inventoryName.split(" - ");
            if (inventoryNameParts.length > 1 && inventoryNameParts[inventoryNameParts.length - 1].includes("Foil")) {
                newResultProdImage.before(resOrigParts.foilOverlay.clone(true));

                newResult.addClass("foil");
                if (isDetailView) {
                    newResult.find(".foilOverlay").addClass("go");
                }
            }
        }
        if (result.categoryName) result.categoryName = result.categoryName.replace(": ", " ");

        checkFoilViewports();
        if (isDetailView) {
            resizeEquivalentItems();
        }
    })
    return newResult;

}

var chunkTimer;
var cancelChunkTimer = function () {
    if (chunkTimer) {
        clearTimeout(chunkTimer);
        chunkTimer = undefined;
    }
}

var populateFilterPanel = function (renderCache) {
    var panelContents = $("#searchFilterPanelContents");
    panelContents.empty();

    searchFilters[renderCache.filterProductID].filters.forEach(function (filter) {
        var newFilterGroup = $("<div class='filterGroup'></div>");
        $("<div class='header'>" + filter.displayName + "</div>").appendTo(newFilterGroup);
        filter.values.forEach(function (val) {
            var isChecked = renderCache.filters[filter.name].includes(val.name);
            var inputCheckbox = "<input type='checkbox'>";
            if (isChecked) inputCheckbox = "<input type='checkbox' checked>";
            var newCheckbox = $(inputCheckbox);
            var newCheckbox = $("<label>" + inputCheckbox + " " + val.name + "</label>");
            newCheckbox.data({
                name: filter.name,
                value: val.name
            })
            newCheckbox.appendTo(newFilterGroup);
        })
        $(newFilterGroup).appendTo(panelContents);
    })

}


var processSearchResultFilters = function (renderCache) {

    var inputStrings = renderCache.filterText.toAscii().split(" ");
    var results = [...renderCache.results, ...renderCache.bundles].filter(function (v) {
        var resData = $(v).data("resData");
        if (renderCache.hideOutOfStock && !buyMode) {
            var inStock = true;
            if (resData.isBundle) {
                inStock = resData.quantity > 0;
            } else {
                inStock = resData.variants.some(v => v.quantity > 0);
            }
            if (!inStock) return false;
        }
        if (buyMode) {
            var hasBuy = resData.buyPrice > 0;
            var isBulk = resData.isBulk;
            if (!hasBuy) return false;
            if (!buyListBulk && isBulk) return false;
        }

        if (renderCache.filterProductID == resData.productTypeID) {
            var currentFilterNames = Object.keys(renderCache.filters);
            var passFilter = currentFilterNames.every(function (filterName) {
                var filterValue = renderCache.filters[filterName];
                var itemValue = resData.filterFields && resData.filterFields[filterName];
                if (itemValue === undefined || filterValue.length == 0) return true;
                if (Array.isArray(itemValue)) {
                    return itemValue.some(function (val) {
                        return filterValue.includes(val);
                    })
                } else {
                    return filterValue.includes(itemValue);
                }

            })
            if (!passFilter) return false;

        };

        var inventoryName = resData.inventoryName.toAscii();
        return inputStrings.every(function (sStr) {
            return inventoryName.includes(sStr);
        })


    });
    renderCache.filterCount = results.length;
    $("#filterCount").text(results.length);

    var selectedOption = renderCache.sortSelect.find("option:selected");
    var selectedVal = selectedOption.val();
    if (selectedVal == "custom") {
        selectedData = selectedOption.data();
        fieldName = selectedData.name;
        groupNames = selectedData.values.map(v => v.name);

        groups = [];
        groupNames.forEach(function (v) {
            groups.push([]);
        })
        groups.push([]);
        var unknownI = groups.length - 1;

        results.forEach(function (v) {
            var resData = $(v).data("resData");
            var groupI = -1;
            if (renderCache.filterProductID == resData.productTypeID) {
                var fieldValue = resData.filterFields && resData.filterFields[fieldName];
                groupI = groupNames.indexOf(String(fieldValue));
            }
            if (groupI < 0) {
                groupI = unknownI;
            }
            groups[groupI].push(v)
        })

        groups.forEach(function (group, i) {
            groups[i] = group.sort(function (a, b) {
                var aName = $(a).data("resData").inventoryName;
                var bName = $(b).data("resData").inventoryName;
                return aName < bName ? -1 : 1;
            })
        })

        results = [];
        groups.forEach(function (group, i) {
            if (group.length) {
                var groupHeader = groupNames[i];
                if (groupHeader === undefined) groupHeader = "Others";
                results.push($('<div class="groupDivider">' + groupHeader + '</div>'));
                group.forEach(function (v) {
                    results.push(v);
                })
            }
        })
    } else if (selectedVal == "alpha") {
        results = results.sort(function (a, b) {
            var aData = $(a).data("resData");
            var bData = $(b).data("resData");
            if ((aData.isBundle || bData.isBundle) && !(aData.isBundle && bData.isBundle)) {
                if (aData.isBundle) return -1;
                if (bData.isBundle) return 1;
            }
            return aData.inventoryName.localeCompare(bData.inventoryName);

        })
    } else if (selectedVal == "priceLow" || selectedVal == "priceHigh") {
        results = results.sort(function (a, b) {
            var aPrice = 0;
            var bPrice = 0;
            if (buyMode) {
                aPrice = $(a).data("resData").buyPrice;
                bPrice = $(b).data("resData").buyPrice;
            } else {
                var aVariants = $(a).data("resData").variants;
                var bVariants = $(b).data("resData").variants;

                var aDefaultVariant = aVariants.find(v => v.default);
                var bDefaultVariant = bVariants.find(v => v.default);

                aPrice = aDefaultVariant ? aDefaultVariant.price : 0;
                if (!aDefaultVariant || aDefaultVariant.quantity == 0) {
                    var aFirstQuantityVariant = aVariants.find(v => v.quantity);
                    if (aFirstQuantityVariant) aPrice = aFirstQuantityVariant.price;
                }

                bPrice = bDefaultVariant ? bDefaultVariant.price : 0;
                if (!bDefaultVariant || bDefaultVariant.quantity == 0) {
                    var bFirstQuantityVariant = bVariants.find(v => v.quantity);
                    if (bFirstQuantityVariant) bPrice = bFirstQuantityVariant.price;
                }
            }

            if (selectedVal == "priceLow") {
                return aPrice < bPrice ? -1 : 1;
            } else {
                return aPrice > bPrice ? -1 : 1;
            }
        })
    }

    var searchResults = renderCache.searchDiv;
    searchResults.children().detach();
    searchResults.append(renderCache.categoryLinks);
    // searchResults.append(renderCache.bundles);
    searchResults.append(results);
    if (results.length == 0) {
        if (buyMode) {
            searchResults.append($(`<div class="noSearchResults"><span>You are in BuyList Mode,</span> <span>but there are no buy items here.</span><br><span>Toggle BuyList off above to</span> <span>return to regular sales.</span></div>`));
        } else {
            if (renderCache.results == 0) {
                searchResults.append($(`<div class="noSearchResults"><span>No Products Found</span></div>`));
            } else {
                searchResults.append($(`<div class="noSearchResults"><span>${renderCache.results.length} products found,</span> <span>but filters have hidden all of them.</span> <span>Please adjust filters above</span> <span>to display results.</span></div>`));
            }
        }
    }
}

var processSearchResults = function (res, searchText, isCategory, targetRenderCacheID) {
    var newRenderCache = {
        searchDiv: $(`<div id="searchResults"></div>`),
        searchText: searchText,
        resultCount: res.result.listings.length,
        filterText: "",
        filterProductID: res.result.productTypeID,
        filters: {},
        toggles: [],
        categoryLinks: [],
        sortSelect: undefined,
        hideOutOfStock: (!isCategory && !!customizations.searchHideOutOfStock) ? true : false,
        results: [],
        bundles: []
    };
    searchRenderCache[targetRenderCacheID] = newRenderCache;

    if (res && res.result && res.result.listings) {
        res = res.result;

        var searchResults = [];

        res.listings.forEach(function (listing) {
            var newResult = createNewResult(listing, undefined, isCategory);
            searchResults.push(newResult);
        })
        newRenderCache.results = searchResults;

        var bundleResults = [];
        for (bundle of res.bundles || []) {
            bundle.inventoryName = bundle.name;
            bundle.isBundle = true;
            var newBundle = createNewResult(bundle, false, isCategory, false, true);
            bundleResults.push(newBundle);
        }
        newRenderCache.bundles = bundleResults;
        if (res.bundles) {
            newRenderCache.resultCount += res.bundles.length;
        }

        if (res.linkedCategories && res.linkedCategories.length > 0) {
            res.linkedCategories = res.linkedCategories.sort((a, b) => a.name.localeCompare(b.name));

            var newGroupDivider = $(`<div class="groupDivider">Related Categories</div>`);
            newRenderCache.categoryLinks.push(newGroupDivider);

            for (link of res.linkedCategories) {
                var newLink = $(`<a href="/store/category/${link.name}" class="categoryLink btn-orange">${link.name}</a>`);
                newLink.data(link);
                newLink.click(function (event) {
                    event.preventDefault();
                    var linkData = $(event.target).data();
                    loadSearch(linkData.name, true);
                })
                newRenderCache.categoryLinks.push(newLink);
            }
        }

        var filterProductID = res.productTypeID;
        var newFilters = {};
        if (filterProductID !== undefined) {
            searchFilters[filterProductID].filters.forEach(function (filter) {
                var newValues = [];
                var hasNegativeToggle = filter.values.some(function (val) {
                    return val.toggle && !val.toggleDefault;
                })
                filter.values.forEach(function (val) {
                    if (hasNegativeToggle && isCategory && val.toggleDefault != 0) newValues.push(val.name);
                    if (val.toggle) {
                        var newToggle = $(`<input type="checkbox"${!isCategory || val.toggleDefault ? " checked" : ""}>`);
                        // ${val.name}</div>
                        newToggle.data({ name: filter.name, value: val.name });
                        newToggle.change(function (event) {
                            var toggleData = $(event.target).data();
                            var isActive = $(event.target).prop("checked");
                            var targetFilter = searchRenderCache[currentRenderCacheID].filters[toggleData.name];
                            var filterDef = searchFilters[searchRenderCache[currentRenderCacheID].filterProductID].filters.find(v => v.name == toggleData.name);
                            if (isActive) {
                                targetFilter.push(toggleData.value);
                                if (targetFilter.length == filterDef.values.length) {
                                    targetFilter.splice(0, targetFilter.length); //remove all
                                }
                            } else {
                                var index = targetFilter.indexOf(toggleData.value);
                                if (index != -1) targetFilter.splice(index, 1);

                                if (targetFilter.length == 0) {
                                    filterDef.values.forEach(function (v) {
                                        if (v.name != toggleData.value) targetFilter.push(v.name);
                                    })
                                }
                            }
                            detachRenderCache(true);
                            processSearchResultFilters(searchRenderCache[currentRenderCacheID]);
                            attachRenderCache(searchRenderCache[currentRenderCacheID], true);
                        })
                        var newToggleWrapper = $(`<div class="toggleWrapper"><div>${val.toggleDisplayName}</div></div>`);
                        newToggle.appendTo(newToggleWrapper);
                        newToggle.bootstrapToggle({ size: "small", onstyle: "orange", height: 28, width: 46.4531 })
                        newRenderCache.toggles.push(newToggleWrapper);
                    }
                })
                newFilters[filter.name] = newValues
            })
        }
        newRenderCache.filters = newFilters;

        var newToggle = $(`<input type="checkbox"${newRenderCache.hideOutOfStock ? "" : " checked"}>`);
        newToggle.change(function (event) {
            currentRenderCache = searchRenderCache[currentRenderCacheID]
            currentRenderCache.hideOutOfStock = !$(event.target).prop("checked");
            detachRenderCache(true);
            processSearchResultFilters(currentRenderCache);
            attachRenderCache(currentRenderCache, true);
        })
        var newToggleWrapper = $(`<div class="toggleWrapper outOfStockToggle"><div>Out of Stock</div></div>`);
        newToggle.appendTo(newToggleWrapper);
        newToggle.bootstrapToggle({ size: "small", onstyle: "orange", height: 28, width: 46.4531 })
        newRenderCache.toggles.push(newToggleWrapper);



        var newSearchSort = $(`<select id="searchSort">
                                <option value="alpha">Alphabetical</option>
                                <option value="priceLow">Price (Low to High)</option>
                                <option value="priceHigh">Price (High to Low)</option>
                            </select>`);
        newSearchSort.change(function (event) {
            detachRenderCache(true);
            processSearchResultFilters(newRenderCache);
            attachRenderCache(newRenderCache, true);
        })
        if (filterProductID !== undefined) {
            searchSorts[filterProductID].sorts.forEach(function (sort) {
                var newSort = $(`<option value="custom">${sort.displayName}</option>`);
                newSort.data(sort);
                if (sort.default) {
                    newSort.prop("selected", true);
                    newSort.prependTo(newSearchSort);
                } else {
                    newSort.insertBefore(newSearchSort.find("option[value='priceLow']"));
                }
            })
        }
        newRenderCache.sortSelect = newSearchSort;
        $("document").focus();
    }
    $("#searchTotal").text(newRenderCache.resultCount);
    return newRenderCache;

}

var detachRenderCache = function (skipToggles) {
    $("#searchResults").detach();
    if (!skipToggles) {
        $("#searchHeader .toggleWrapper").detach();
        $("#searchSort").detach();

        $("#searchSortWrapper").empty();
        $("<select disabled><option>Loading...</option></select>").appendTo("#searchSortWrapper");
        $("#searchFilterBtn").addClass("disabled");
    }

}

var attachRenderCache = function (renderCache, skipToggles) {
    renderCache.searchDiv.appendTo("#search");
    if (!skipToggles) {
        for (toggle of renderCache.toggles) {
            toggle.insertBefore("#searchFilterBtn");
        }
        // renderCache.toggleDiv.appendTo("#searchHeader .searchHeaderLast");
        $("#searchSortWrapper").empty();
        $("#searchFilterBtn").removeClass("disabled");

        renderCache.sortSelect.appendTo("#searchSortWrapper");
        buyListToggle.insertAfter("#searchFilter");
    }

    var outOfStockToggle = renderCache.toggles.find(v => v.is(".outOfStockToggle"))
    if (outOfStockToggle) {
        toggle.toggleClass("disabled", buyMode);
        toggle.find(".btn").toggleClass("disabled", buyMode);
    }
    checkFoilViewports();
}

var doSearch = function (searchText, isCategory, renderCacheID, saleID, productTypeID) {
    currentRenderCacheID = renderCacheID;
    if (searchText || saleID) {
        $("#advancedSearch").hide();
        if (!searchText) searchText = "";

        var data = {};
        if (saleID) {
            data.saleID = saleID;
        } else if (isCategory) {
            data.category = searchText;
        } else {
            data.search = searchText;
        }

        if (productTypeID) {
            data.productTypeID = productTypeID;
        }

        detachRenderCache();
        var currentRenderCache = searchRenderCache[renderCacheID];
        if (currentRenderCache && currentRenderCache.searchDiv && currentRenderCache.searchDiv.children().length > 0) {

            $("#filterCount").text(currentRenderCache.filterCount === undefined ? currentRenderCache.resultCount : currentRenderCache.filterCount);
            $("#searchTotal").text(currentRenderCache.resultCount);
            $("#searchString").text(currentRenderCache.searchText);
            $("#searchFilter").val(currentRenderCache.filterText ? currentRenderCache.filterText : "");
            attachRenderCache(currentRenderCache);

            switchView("search");
        } else {
            $("#filterCount").text("Loading");
            $("#searchTotal").text("...");
            $("#searchString").text(searchText);
            $("#searchFilter").val("");

            gtagSearch(data.search);
            switchView("search");
            getJSON("getProductListings", data, function (res) {
                if (res && res.result) {
                    detachRenderCache();
                    if (res.result.saleName) searchText = res.result.saleName;
                    if (res.result.isBuyCategory) toggleBuyMode(true);
                    var newRenderCache = processSearchResults(res, searchText, isCategory, renderCacheID);
                    processSearchResultFilters(newRenderCache);
                    attachRenderCache(newRenderCache);

                    $("#searchString").text(searchText);
                    $("#searchFilter").val("");

                }
            });
        }

        if (searchText) document.title = searchText + " - " + customizations.title;
        scrollToContent();
    } else {
        $("#searchString")[0].innerText = "Advanced Search";
        $("#filterCount")[0].innerText = "0";
        $("#searchTotal")[0].innerText = "0";

        switchView("search");
        detachRenderCache();
        $("#advancedSearch").show();

        var currentRenderCache = searchRenderCache[renderCacheID];
        if (currentRenderCache && currentRenderCache.searchDiv && currentRenderCache.searchDiv.children().length > 0) {
            $("#filterCount").text(currentRenderCache.filterCount === undefined ? currentRenderCache.resultCount : currentRenderCache.filterCount);
            $("#searchTotal").text(currentRenderCache.resultCount);
            if (searchText) $("#searchString").text(currentRenderCache.searchText);
            $("#searchFilter").val(currentRenderCache.filterText ? currentRenderCache.filterText : "");

            attachRenderCache(currentRenderCache);
        }
        buyListToggle.insertAfter("#searchFilter");

    }
}
var hideMenus = function () {
    $(".menuLevel1").hide();
    $(".menuLevel3Holder").hide();
    $(".menuLevel2.selected").find(".fa-angle-down").removeClass("fa-rotate-180");
    $(".menuLevel2.selected").removeClass("selected");

}

var hideOnClickOutside = function (selector) {
    const outsideClickListener = (event) => {
        if (event.target.parentElement) {
            if (!$(event.target).closest(selector).length) {//} && !$(event.target.parentElement).hasClass("autocomplete-suggestions")) {
                //is not within the DOM tree of the selector, and not an autocomplete dropdown
                removeClickListener();
                if ($(selector).is(':visible')) {
                    hideMenus();
                }
            }
        }
        //             if (selector === "#layerSelections") toggleLayerSelector(false);
        //             if (selector === "#layerSliders") toggleSliderSelector(false);
        //             if (selector === "#layerRegions") toggleRegionSelector(false);
        //             if (selector === "#companyExcluderList") toggleCompanyExcluder(false);
        //         }
        //     }
        // }
    }

    const removeClickListener = () => {
        document.removeEventListener('click', outsideClickListener)
    }

    document.addEventListener('click', outsideClickListener)
}

var attachMenuHandlers = function () {
    $(".menuBtn").mouseenter(function (event) {
        if ($(event.target).hasClass("menuBtn")) {
            if ($(event.target).find(".menuLevel1").css("display") !== "flex") {
                hideMenus();
                if ($(event.target).find(".menuLevel2").length > 0) {
                    $(event.target).find(".menuLevel1").css("display", "flex");
                }
            }
        }
    });
    $(".menuBtn").mouseleave(function (event) {
        var e = event.originalEvent;
        if (!event.relatedTarget || !event.toElement) {
            //chrome bug
            console.log("chrome menu bug");
            return;
        }
        if ((!$(event.currentTarget).closest(event.toElement).length) || $(event.currentTarget).hasClass("menuBtn")) {
            hideMenus();
        }
    });
    $(".menuBtn").click(function (event) {
        if (!$(event.target).hasClass("menuBtn")) return;

        var subMenus = $(event.target).find(".menuLevel2");
        if (subMenus.length == 0) {
            loadSearch(event.target.innerText, true);
        }
    });
    $(".menuLevel2").click(function (event) {
        console.log("sub click");

        var target = $(event.target).closest(".menuLevel2");
        if ($(target).children(".menuLevel3").length == 0) { //level2 with no children clicked
            category = target[0].innerText; //load category
            hideMenus();
            loadSearch(category, true);
        } else { //has children, expand holder
            var nextSearch = target;

            do {
                nextSearch = $(nextSearch).next();
            } while (!nextSearch.hasClass("menuLevel3Holder"));

            var isOpen = nextSearch.parent().find(".menuLevel3Holder");
            var openFake = isOpen[0];

            isOpen = isOpen.filter(function (idx, elm) {
                return $(elm).css("display") === "flex";
            });
            if (isOpen.length == 0) {
                isOpen = openFake;
            }

            $(isOpen).slideUp({
                duration: 300,
                done: function () {
                    $(".menuLevel2.selected").find(".fa-angle-down").removeClass("fa-rotate-180");

                    if (!$(target[0]).hasClass("selected")) {
                        $(".menuLevel2.selected").removeClass("selected");
                        $(target).addClass("selected");
                        nextSearch[0].innerHTML = "";
                        $(target).children().filter(".menuLevel3").clone(true).appendTo(nextSearch).css("display", "block");
                        nextSearch.css("display", "flex");
                        nextSearch.hide();
                        $(nextSearch).slideDown({
                            duration: 300,
                            start: function () {
                                target.find(".fa-angle-down").addClass("fa-rotate-180");

                                $(this).css({
                                    display: "flex"
                                })
                            }
                        });

                    } else {
                        $(".menuLevel2.selected").removeClass("selected");
                    }
                }
            });
        }


    });
    $(".menuLevel3").click(function (event) {
        category = event.target.innerText;
        hideMenus();
        loadSearch(category, true);
    });
}
var showRightHeader = function (show) {
    if (show) {
        $("#main").css("grid-template-areas", '"gridHeaderLeft gridHeaderRight" "gridLeft gridRightHeader" "gridLeft gridRightContent" "gridFooter gridFooter"');
        $("#rightHeader").show();
    } else {
        $("#main").css("grid-template-areas", '"gridHeaderLeft gridHeaderRight" "gridLeft gridRightContent" "gridLeft gridRightContent" "gridFooter gridFooter"');
        $("#rightHeader").hide();
    }
}

var popFade = function (good, targetWidth, targetHeight, targetOffsetLeft, targetOffsetTop) {
    var newPop = $('<div class="popFade go"><div class="popYesNo"><i class="fas fa-check yes"></i><i class="fas fa-times no"></i></div></div>');

    if (good) {
        newPop.find(".popYesNo").addClass("yes");
    } else {
        newPop.find(".popYesNo").addClass("no");
    }
    newPop.appendTo("body");

    var width = newPop.outerWidth();
    var height = newPop.outerHeight();
    newPop.css("top", targetOffsetTop - (height / 2) + (targetHeight / 2));
    newPop.css("left", targetOffsetLeft - (width / 2) + (targetWidth / 2));

    setTimeout(function () {
        newPop.remove();
    }, 2000)

}

var switchView = function (view) {
    $(".left").hide();
    $(".right").hide();
    $(".header").hide();

    $("#rightHeader").removeClass("sticky");
    $("#buyHeader").css("display", "none");
    buyListToggle.detach();
    pauseLandingBanners();
    pauseLandingCarousel();
    //showRightHeader(true);

    document.title = customizations.title;
    switch (view) {
        case "home":
            $(".landing").show();
            setTimeout(function () {
                resizeSliders(true);
                resizeCarousel(true);
            }, 1);
            playLandingBanner();
            playLandingCarousel();

            break;
        case "details":
            $("#rightHeader").addClass("sticky");
            $(".details").show();

            if (buyMode) $("#buyHeaderFirst").after(buyListToggle);
            $("#buyHeader").css("display", "");
            scrollToContent();
            break;
        case "bundle":
            $("#rightHeader").addClass("sticky");
            $(".bundle").show();
            scrollToContent();
            break;
        case "cart":
            $(".cart").show();
            validateCartContent();
            // showRightHeader(false);
            // toggleBuyMode(false);
            break;
        case "checkoutBuy":
            $(".checkoutBuy").show();
            // showRightHeader(false);
            // toggleBuyMode(false);
            break;
        case "checkout":
            $(".checkout").show();
            // showRightHeader(false);
            toggleBuyMode(false);
            break;
        case "pages":
            $(".pages").show();
            // showRightHeader(false);
            break;
        case "account":
            $(".account").show();
            // showRightHeader(false);
            break;
        case "deckBuilder":
            $("#rightHeader").addClass("sticky");
            $(".deckBuilder").show();
            $("#deckBuilder .deckInput").show();
            $(".deckOutput").hide();
            // showRightHeader(false);
            toggleBuyMode(false);
            break;
        case "search":
            $("#rightHeader").addClass("sticky");
            $(".search").show();
            $("#advancedSearch").hide();
            $("#buyHeader").css("display", "");
            buyListToggle.insertAfter("#searchFilter");
            break;
        default:
        // code block

    }
}
$(document).on("scroll", function () {
    if ($(document).scrollTop() > 100) {
        $("#floatHeader .logo").fadeIn();
        $("#headerLeft .logo").fadeOut();
    } else {
        $("#floatHeader .logo").fadeOut();
        $("#headerLeft .logo").fadeIn();
    }
    checkCategoriesHeight();

    if ($("#searchFilterPanel").is(":visible")) {
        resizeSearchFilterPanel();
    }

    // $("#searchFilterPanel").innerHeight(window.innerHeight - ($("#searchHeader").offset().top - window.scrollY + $("#searchHeader").outerHeight()));
});

var checkCategoriesHeight = function () {
    var newHeight = window.innerHeight - $("#floatHeader").outerHeight() - Math.max($("#headerLeft").height() - window.scrollY, -4);
    $("#categoriesWrapper").css("max-height", newHeight + "px");

}

var checkFoilViewportsTimer;
var checkFoilViewports = function () {
    if (!checkFoilViewportsTimer) {
        checkFoilViewportsTimer = setTimeout(function () {
            checkFoilViewportsTimer = undefined;

            var allGo = $(".go");
            var toRemove = allGo.filter(function (i, val) {
                val = $(val);
                return (val.withinviewport().length == 0);
            })
            var within = $("#searchResults .foil, #deckBuilder .cardImages .prodImageWrapper.foil, #equivalentItems .searchResult.foil, #relatedItems .searchResult.foil").withinviewport();
            within.find(".foilOverlay").addClass("go");
            toRemove.removeClass("go");
        }, 1)
    }

}

var itemDetailsSetup = false;
var viewItemDetails = function (inventoryID, categoryName, inventoryName) {
    if (doHistory) {
        var state = {};
        var url = "/store";
        if (categoryName) url += "/category/" + categoryName;
        url += "/item/" + inventoryID;
        if (inventoryName) url += "/" + inventoryName.replaceAll(" ", "_");
        state.inventoryID = inventoryID;
        url = encodeURI(url);
        if (JSON.stringify(history.state) !== JSON.stringify(state)) {
            history.pushState(state, null, url);
            console.log("push");
            console.log(state);
        }
    } else {
        doHistory = true;
        history.replaceState(state, null);
    }

    console.log("details clicked: " + inventoryID);

    getJSON("getProductDetails", { inventoryID: inventoryID, skipRelated: true }, function (res) {
        if (res && res.success && res.result) {
            res = res.result;
            switchView("details");
            $("#rightHeader .details .categoryName").text(res.categoryName);
            var itemDetails = $("#itemDetails");
            itemDetails.empty();

            document.title = res.inventoryName + " - " + customizations.title;

            var newRes = createNewResult(res, true);

            newRes.addClass("full");
            if (res.inventoryName.includes("- Foil")) {
                newRes.find(".foilOverlay").addClass("go");
            }
            var newBackground = $(`<div class="blowoutBackground"></div>`);
            newBackground.css("background-image", `url("${constructProductImageURL(res.image, true)}")`)
            newBackground.prependTo(newRes);
            newRes.appendTo(itemDetails);

            $("#equivalentItems").hide();
            $("#relatedItems").hide();
            resizeEquivalentItems();
            getJSON("getProductDetailsRelated", { inventoryID: inventoryID }, function (res2) {
                if (res2 && res2.success) {
                    var equivalentItems = $("#equivalentItemsTarget");
                    equivalentItems.empty();
                    if (res2.result.equivalentItems && res2.result.equivalentItems.length > 0) res2.result.equivalentItems = res2.result.equivalentItems.filter(v => v.inventoryID != res.inventoryID);
                    if (res2.result.equivalentItems && res2.result.equivalentItems.length > 0) {
                        $("#equivalentItemsTargetWrapper").scrollTop(0);

                        res2.result.equivalentItems.sort(function (a, b) {
                            if (b.sameSet != a.sameSet) return b.sameSet - a.sameSet;

                            var adefaultVariant = a.variants.find(variant => variant.default);
                            var afirstStockVariant = a.variants.find(variant => variant.quantity > 0);
                            if (adefaultVariant.quantity == 0 && afirstStockVariant) adefaultVariant = afirstStockVariant;

                            var bdefaultVariant = b.variants.find(variant => variant.default);
                            var bfirstStockVariant = b.variants.find(variant => variant.quantity > 0);
                            if (bdefaultVariant.quantity == 0 && bfirstStockVariant) bdefaultVariant = bfirstStockVariant;

                            return adefaultVariant.price - bdefaultVariant.price;
                        })
                        res2.result.equivalentItems.sort(function (a, b) {
                            var aHasStock = a.variants.find(variant => variant.quantity > 0) ? 1 : 0;
                            var bHasStock = b.variants.find(variant => variant.quantity > 0) ? 1 : 0;
                            return bHasStock - aHasStock;
                        })
                        for (equivItem of res2.result.equivalentItems.slice(0, 50)) {
                            var newRes = createNewResult(equivItem, false, false, true);
                            newRes.addClass("mini");
                            newRes.appendTo(equivalentItems);
                        }
                        // $("#equivalentItems").toggleClass("fewItems", res2.result.equivalentItems.length < 5);
                        var equivItemCount = res2.result.equivalentItems.length % 2 == 0 ? res2.result.equivalentItems.length : res2.result.equivalentItems.length + 1;
                        var equivMaxWidth = (equivItemCount / 2) * 112.5;
                        if (equivMaxWidth > 900) equivMaxWidth = 900;
                        $("#equivalentItems").css("max-width", equivMaxWidth + "px");
                        $("#equivalentItems").show();
                    } else {
                        $("#equivalentItems").hide();
                    }

                    var relatedItems = $("#relatedItemsTarget");
                    relatedItems.empty();
                    if (res2.result.relatedItems && res2.result.relatedItems.length > 0) {
                        $("#relatedItemsTargetWrapper").scrollTop(0);
                        for (relatedItem of res2.result.relatedItems) {
                            var newRes = createNewResult(relatedItem, false, false, true);
                            newRes.addClass("mini miniShowNames");
                            newRes.appendTo(relatedItems);
                        }
                        $("#relatedItems").show();
                    } else {
                        $("#relatedItems").hide();
                    }
                    resizeEquivalentItems();
                }
            })

        } else {
            switchView("details");
            $("#rightHeader .details .categoryName").text("Item Not Found");
            var itemDetails = $("#itemDetails");
            itemDetails.empty();
            $("#equivalentItems").hide();
            $("#relatedItems").hide();

            document.title = "Item Not Found - " + customizations.title;

        }
    });

    if (!itemDetailsSetup) {
        itemDetailsSetup = true;
        $("#itemDetails").on("click", ".fieldValue a", contentLinkHandler);
    }
}

var viewBundleDetails = function (bundleID, categoryName, bundleName) {
    if (doHistory) {
        var state = {};
        var url = "/store";
        if (categoryName) url += "/category/" + categoryName;
        url += "/bundle/" + bundleID;
        if (bundleName) url += "/" + bundleName.replaceAll(" ", "_");
        state.bundleID = bundleID;
        url = encodeURI(url);
        if (JSON.stringify(history.state) !== JSON.stringify(state)) {
            history.pushState(state, null, url);
            console.log("push");
            console.log(state);
        }
    } else {
        doHistory = true;
        history.replaceState(state, null);
    }

    console.log("bundle clicked: " + bundleID);

    getJSON("getBundleDetails", { bundleID: bundleID }, function (res) {
        if (res && res.result) {
            res = res.result;
            res.bundle.inventoryName = res.bundle.name;
            res.bundle.bundleID = parseInt(bundleID);
            switchView("bundle");

            var itemDetails = $("#itemDetails");
            itemDetails.empty();

            switchView("details");
            // res.bundle.categoryName = "Category Name Here";
            $("#rightHeader .details .categoryName").text(res.bundle.categoryName);
            var newRes = createNewResult(res.bundle, true, undefined, false, true);
            newRes.addClass("full");

            newRes.appendTo(itemDetails);

            $("#equivalentItems").hide();
            $("#relatedItems").hide();
            return;


            var newResultProdImage = $("#bundleWrapper").find(".prodImage");
            newResultProdImage.attr("data-src", constructProductImageURL(res.bundle.image, true));
            newResultProdImage.removeClass("lazyloaded").addClass("lazyload");

            $("#bundleItemsList").empty();
            for (bundleItem of res.bundle.bundleItems) {
                var newBundleGroup = $(`<div class="bundleGroup"></div>`);
                var newBundleItems = $(`<div class="bundleItems"></div>`);
                var bundleDef = res.bundle.bundleItemDefinitions.find(v => v.bundleItemDefinitionID == bundleItem.bundleItemDefinitionID);

                var itemTitle = bundleDef.name;
                if (bundleItem.label) itemTitle = `${itemTitle}: ${bundleItem.label}`;

                if (bundleItem.optional) {
                    $(`
                    <div class="bundleItem">
                        <i class="far fa-ban"></i>
                        <div>None</div>
                    </div>
                    `).appendTo(newBundleItems);
                }
                $(`<div class="bundleItemName">${itemTitle}</div>`).appendTo(newBundleGroup);
                for (listing of bundleDef.listings) {
                    var newBundleItem = $(`
                    <div class="bundleItem">
                        <img src="${listing.image}">
                    </div>
                    `);
                    var newBundlePrices = $(`<div class="bundleItemPrice"></div>`);
                    var itemPrice = listing.variants.find(v => v.default).price;
                    var discountPrice = itemPrice * bundleItem.priceMultiplier;
                    if (bundleItem.price) discountPrice = bundleItem.price;
                    var newBundleItemPrice = $(`<div>${round(itemPrice, 2, true, true, true)}</div>`);
                    newBundleItemPrice.appendTo(newBundlePrices);
                    if (discountPrice != itemPrice) {
                        newBundleItemPrice.addClass("prodRegularPrice");
                        newBundleItemPrice.css("display", "block");
                        $(`<div>${round(discountPrice, 2, true, true, true)}</div>`).appendTo(newBundlePrices);
                    }
                    newBundlePrices.appendTo(newBundleItem);

                    newBundleItem.appendTo(newBundleItems);
                }
                newBundleItems.appendTo(newBundleGroup);
                $(`<div class="bundleItemSelectionWrapper">Selection: <span class="bundleItemSelection">None</span></div>`).appendTo(newBundleGroup);

                newBundleGroup.appendTo("#bundleItemsList");

            }
            return;
            $("#rightHeader .details .categoryName").text(res.categoryName);
            var itemDetails = $("#itemDetails");
            itemDetails.empty();

            document.title = res.inventoryName + " - " + customizations.title;

            var newRes = createNewResult(res, true);

            newRes.addClass("full");
            if (res.inventoryName.includes("- Foil")) {
                newRes.find(".foilOverlay").addClass("go");
            }
            var newBackground = $(`<div class="blowoutBackground"></div>`);
            newBackground.css("background-image", `url("${constructProductImageURL(res.image, true)}")`)
            newBackground.prependTo(newRes);
            newRes.appendTo(itemDetails);

            var equivalentItems = $("#equivalentItemsTarget");
            equivalentItems.empty();
            if (res.equivalentItems && res.equivalentItems.length > 0) res.equivalentItems = res.equivalentItems.filter(v => v.inventoryID != res.inventoryID);
            if (res.equivalentItems && res.equivalentItems.length > 0) {
                $("#equivalentItemsTargetWrapper").scrollTop(0);

                res.equivalentItems.sort(function (a, b) {
                    if (b.sameSet != a.sameSet) return b.sameSet - a.sameSet;

                    var adefaultVariant = a.variants.find(variant => variant.default);
                    var afirstStockVariant = a.variants.find(variant => variant.quantity > 0);
                    if (adefaultVariant.quantity == 0 && afirstStockVariant) adefaultVariant = afirstStockVariant;

                    var bdefaultVariant = b.variants.find(variant => variant.default);
                    var bfirstStockVariant = b.variants.find(variant => variant.quantity > 0);
                    if (bdefaultVariant.quantity == 0 && bfirstStockVariant) bdefaultVariant = bfirstStockVariant;

                    return adefaultVariant.price - bdefaultVariant.price;
                })
                for (equivItem of res.equivalentItems) {
                    var newRes = createNewResult(equivItem, false, false, true);
                    newRes.addClass("mini");
                    newRes.appendTo(equivalentItems);
                }
                // $("#equivalentItems").toggleClass("fewItems", res.equivalentItems.length < 5);
                var equivItemCount = res.equivalentItems.length % 2 == 0 ? res.equivalentItems.length : res.equivalentItems.length + 1;
                var equivMaxWidth = (equivItemCount / 2) * 112.5;
                if (equivMaxWidth > 900) equivMaxWidth = 900;
                $("#equivalentItems").css("max-width", equivMaxWidth + "px");
                $("#equivalentItems").show();
            } else {
                $("#equivalentItems").hide();
            }

            var relatedItems = $("#relatedItemsTarget");
            relatedItems.empty();
            if (res.relatedItems && res.relatedItems.length > 0) {
                $("#relatedItemsTargetWrapper").scrollTop(0);
                for (relatedItem of res.relatedItems) {
                    var newRes = createNewResult(relatedItem, false, false, true);
                    newRes.addClass("mini miniShowNames");
                    newRes.appendTo(relatedItems);
                }
                $("#relatedItems").show();
            } else {
                $("#relatedItems").hide();
            }
            resizeEquivalentItems();
        }
    });

    // if (!itemDetailsSetup) {
    //     itemDetailsSetup = true;
    //     $("#itemDetails").on("click", ".fieldValue a", contentLinkHandler);
    // }
}

var addToCartMulti = function (cartID, items, goToCart, callback) {
    gTagAddToCart(items);
    getJSON("addToCart", { cartID: cartID, items: items }, function (res) {
        if (goToCart) doCart();
        if (callback) callback(res);
    }, true);
}
var addToCart = function (cartID, inventoryID, variantID, variantCombinationID, quantity, callback) {
    items = [{
        inventoryID, inventoryID,
        variantID: variantID,
        quantity: quantity,
        variantCombinationID: variantCombinationID
    }];
    addToCartMulti(cartID, items, false, callback);
}
var validateCartContent = function (loading, buyCart) {
    if (loading) {
        $("#cart .beginCheckoutBtn").toggle(false);
        $("#addCouponToCartBtn").toggle(false);
        $("#cart .noItemsMessage").toggle(false);
        $("#cart .wishItemsMessage").toggle(false);
        $("#cartCouponsHeader").toggle(false);
        $("#cart .loadingCart").toggle(true);
        // $("#cartHeaderMessageRegular").toggle(false);
        $("#cartHeaderMessageCPM").toggle(false);
        $("#cartItemsCPM").toggle(false);
        $("#wishlistItems").toggle(false);
        $("#cartItems").toggle(false);
        $("#cartHeaderOutOfStock").toggle(false);
        $("#cartItemsOutOfStock").toggle(false);
    } else {
        $("#cart .loadingCart").toggle(false);
        var hasItems = $("#cartItems").children().length > 0;
        var hasOutOfStockItems = $("#cartItemsOutOfStock").children().length > 0;
        var hasBuyCPMItems = $("#cartItemsCPM").children().length > 0;
        $("#cartItems").toggle(hasItems);
        $("#cart .beginCheckoutBtn").toggle(hasItems);
        $("#cart .beginCheckoutBtn").removeClass("disabled");

        var hasCoupons = $("#cartCoupons").children().length > 0;
        $("#cartCouponsHeader").toggle(hasCoupons);
        $("#addCouponToCartBtn").toggle(!buyCart);
        $("#cart .noItemsMessage").toggle(!hasItems && !hasBuyCPMItems);

        var hasWishItems = $("#wishlistItems").children().length > 0;
        $("#cart .wishItemsMessage").toggle(hasWishItems);
        $("#wishlistItems").toggle(hasWishItems);

        $("#beginCheckoutBtnCPM").toggle(hasBuyCPMItems);
        $("#cartItemsCPM").toggle(hasBuyCPMItems);

        $("#cartHeaderOutOfStock").toggle(hasOutOfStockItems);
        $("#cartItemsOutOfStock").toggle(hasOutOfStockItems);

        // $("#cartHeaderMessageRegular").toggle(!!(customizations.buyOrderPaymentMethodModes && hasItems && buyCart));
        $("#cartHeaderMessageCPM").toggle(!!(customizations.buyOrderPaymentMethodModes && hasItems && hasBuyCPMItems && buyCart));

        $("#cart .cartFooter").toggle(true);
        var cartFooters = $("#cart .cartFooter").toArray();
        for (cartFooter of cartFooters) {
            var visibleChildrenCount = $(cartFooter).children(":visible").length;
            $(cartFooter).toggle(visibleChildrenCount > 0);
        }
    }
}

var populateCartContent = function (cartItems) {
    $("#cartItems").empty();
    $("#cartCoupons").empty();
    $("#cartItemsCPM").empty();
    $("#wishlistItems").empty();
    if (cartItems) {
        $("#cart").data("cartItems", cartItems.items);
        cartItems.items.forEach(function (nextItem) {
            if (nextItem.inventoryQuantity < 0) nextItem.inventoryQuantity = 0;

            var newCartItem = $("#cart .cartItem.hidden").clone(true);
            newCartItem.removeClass("hidden");

            newCartItem.data("cartItem", nextItem);
            newCartItem.find(".image img").attr("src", constructProductImageURL(nextItem.image, true));
            newCartItem.find(".name")[0].innerText = nextItem.name;
            var url = "/store/category/" + nextItem.categoryName + "/item/" + nextItem.inventoryID + "/" + nextItem.name.replaceAll(" ", "_");
            url = encodeURI(url);
            newCartItem.find(".name").attr("href", url);
            if (nextItem.releaseDate) {
                var releaseDate = new Date(nextItem.releaseDate);
                var releaseDateString = shortMonths[releaseDate.getMonth()] + " " + releaseDate.getDate() + nth(releaseDate.getDate());
                newCartItem.find(".releaseDate").text(releaseDateString)
            } else {
                newCartItem.find(".releaseDateWrapper").remove();
            }
            if (nextItem.userCheckoutQuantityLimit) {
                newCartItem.find(".prodPurchaseLimit").text(limitToLimitText(nextItem.userCheckoutQuantityLimit, nextItem.userCheckoutQuantityLimitResetMinutes));
            } else {
                newCartItem.find(".prodPurchaseLimit").remove();
            }
            if (!nextItem.inStorePickupOnly) newCartItem.find(".cartItemInStorePickupOnly").remove();
            if (!nextItem.domesticOnly) newCartItem.find(".cartItemDomesticOnly").remove();

            newCartItem.find(".category")[0].innerText = nextItem.categoryName;
            newCartItem.find(".variant")[0].innerText = nextItem.variantName;
            newCartItem.find(".price")[0].innerText = "$" + round(nextItem.price, 2, true) + " x";
            if (nextItem.regularPrice) {
                newCartItem.find(".regularPrice").text("$" + round(nextItem.regularPrice, 2, true)).css("display", "block");
            }
            newCartItem.find(".quantity").val(Math.min(nextItem.quantity, nextItem.inventoryQuantity));

            if (nextItem.inventoryQuantity < nextItem.quantity) {
                var newWishlistItem = newCartItem.clone(true);
                newWishlistItem.find(".quantity").val(nextItem.quantity - nextItem.inventoryQuantity);
                newWishlistItem.find(".quantity").inputSpinner({
                    buttonsClass: "btn-orange btn-orange-spinner"
                });
                newWishlistItem.appendTo("#wishlistItems");
            }

            newCartItem.find(".quantity").inputSpinner({
                buttonsClass: "btn-orange btn-orange-spinner"
            });


            if (nextItem.inventoryQuantity) newCartItem.appendTo("#cartItems");
            // $("<p>"+nextItem.name+" - "+nextItem.variantName+" - Quantity: "+nextItem.quantity+"</p>").appendTo(cartContent);
        })
        if (cartItems.bundles) {
            for (bundle of cartItems.bundles) {
                var bundleURL = "/store/category/" + bundle.categoryName + "/bundle/" + bundle.bundleID + "/" + bundle.bundleName.replaceAll(" ", "_");
                var newBundleItem = $(`
                    <div class="cartItemBundle">
                        <div class="cartItemBundleTop">
                            <div><a href="${bundleURL}">${bundle.bundleName}</a></div>
                            <div class="bundleDelete fas fa-times"></div>
                        </div>
                        <div class="cartItemBundleBottom">
                            <div class="cartItemBundleImageWrapper">
                                <img src="${bundle.bundleImage}">
                            </div>
                            <div class="cartItemBundleItems"></div>
                        </div>
                    </div>`);
                newBundleItem.data(bundle);
                var newBundleItems = newBundleItem.find(".cartItemBundleItems");
                for (item of bundle.bundleItems) {
                    if (!item.cartBundleItem || !item.cartBundleItem.name) continue;
                    var origPrice = item.cartBundleItem.price;
                    var discountPrice = item.cartBundleItem.price * item.priceMultiplier;
                    if (item.price) discountPrice = item.price;
                    var displayPrice = $(`<div></div>`);
                    $(`<div class="regularPrice">${round(origPrice, 2, true, true, true)}</div>`).appendTo(displayPrice);
                    $(`<div class="discountPrice">${round(discountPrice, 2, true, true, true)}</div>`).appendTo(displayPrice);

                    origPrice = round(origPrice, 2, true, true, true);
                    discountPrice = round(discountPrice, 2, true, true, true);
                    if (origPrice == discountPrice) origPrice = "";
                    var newItem = $(`<div class="cartItemBundleItem">
                        <div class="cartItemBundleItemName">${item.cartBundleItem.name}</div>
                        <div class="regularPrice">${origPrice}</div>
                        <div class="discountPrice">${discountPrice}</div>
                    </div>`);
                    // displayPrice.appendTo(newItem);
                    newItem.appendTo(newBundleItems);
                }
                if (bundle.isOutOfStock) {
                    newBundleItem.appendTo("#cartItemsOutOfStock");
                } else {
                    newBundleItem.appendTo("#cartItems");
                }
            }
        }
        if (cartItems.coupons) {
            for (nextCoupon of cartItems.coupons) {
                console.log(nextCoupon);

                var newCartCoupon = $("#cart .cartCoupon.hidden").clone(true);
                newCartCoupon.removeClass("hidden");
                newCartCoupon.data("cartCoupon", nextCoupon);

                newCartCoupon.find(".name").text(nextCoupon.label);
                newCartCoupon.find(".couponCode").text(nextCoupon.couponCode);
                if (nextCoupon.orderDiscountValue) {
                    newCartCoupon.find(".couponValue").text(round(nextCoupon.orderDiscountValue, 2, true, true, true));
                } else {
                    newCartCoupon.find(".couponValueWrapper").hide();
                }
                if (nextCoupon.endDate) {
                    var couponExpiryDate = new Date(nextCoupon.endDate);
                    var couponExpiryHourStrings = ["12am", "1am", "2am", "3am", "4am", "5am", "6am", "7am", "8am", "9am", "10am", "11am", "12pm", "1pm", "2pm", "3pm", "4pm", "5pm", "6pm", "7pm", "8pm", "9pm", "10pm", "11pm"];
                    var couponExpiryAMPM = couponExpiryHourStrings[couponExpiryDate.getHours()];
                    var couponExpiryDateString = `${shortMonths[couponExpiryDate.getMonth()]} ${couponExpiryDate.getDate()}${nth(couponExpiryDate.getDate())} at ${couponExpiryAMPM}`;
                    newCartCoupon.find(".couponExpiryDate").text(couponExpiryDateString);
                } else {
                    newCartCoupon.find(".couponExpiryDateWrapper").hide();
                }
                newCartCoupon.appendTo("#cartCoupons");
            }
        }
    }
    validateCartContent();
}

var populateCart = function (cartData) {
    var cartID = cartData.id;
    var cartName = cartData.name;

    var allCarts = $("#carts > ol > li");
    allCarts.removeClass("active");

    allCarts.each(function (i, listItem) {
        if (!$(listItem).hasClass("addCartBtn")) {
            if ($(listItem).data("cartData").id == cartID) $(listItem).addClass("active");
        }
    })
    $("#cart").data("cartData", cartData);

    $(".editCartNameBtn").show()
    if (cartName == "Cart") {
        // cartName = "Cart Items";
        $(".editCartNameBtn").hide()
    }
    if (cartName == "Saved") {
        // cartName = "Saved Items";
        $(".editCartNameBtn").hide()
    }
    if (cartID == "buy") {
        // cartName = "Buy Cart";
        $(".editCartNameBtn").hide()
    }

    $(".currentCartName")[0].innerText = cartName + " Items";
    $("#cartItems").empty();
    $("#cartCoupons").empty();
    $("#cartItemsCPM").empty();
    $("#wishlistItems").empty();
    validateCartContent(true);
    if (cartID == "buy") {
        getJSON("getBuyCart", {}, function (res) {
            $("#cart").data("cartItems", undefined);
            $("#cartItems").empty();
            $("#cartCoupons").empty();
            $("#cartItemsCPM").empty();
            $("#wishlistItems").empty();

            if (res && res.result && res.result.buyCartItems) {
                for (nextItem of res.result.buyCartItems) {
                    newCartItem = $("#cart .cartItem.hidden").clone(true);
                    newCartItem.removeClass("hidden");

                    newCartItem.data("cartItem", nextItem);
                    newCartItem.find(".image img").attr("src", constructProductImageURL(nextItem.image, true));
                    newCartItem.find(".name")[0].innerText = nextItem.name;
                    newCartItem.find(".name").attr("href", "/store/category/" + nextItem.categoryName + "/item/" + nextItem.inventoryID + "/" + nextItem.name.replaceAll(" ", "_"));
                    // if (nextItem.releaseDate) {
                    //     var releaseDate = new Date(nextItem.releaseDate);
                    //     var releaseDateString = shortMonths[releaseDate.getMonth()] + " " + releaseDate.getDate() + nth(releaseDate.getDate());
                    //     newCartItem.find(".releaseDate").text(releaseDateString)
                    // } else {
                    newCartItem.find(".releaseDateWrapper").remove();
                    // }
                    newCartItem.find(".prodPurchaseLimit").remove();
                    newCartItem.find(".cartItemInStorePickupOnly").remove();
                    newCartItem.find(".cartItemDomesticOnly").remove();


                    newCartItem.find(".category").text(nextItem.categoryName);

                    var buyLimit = "";
                    if (nextItem.buyTargetRemaining) buyLimit = "Limit: " + nextItem.buyTargetRemaining;
                    newCartItem.find(".variant").text(buyLimit);

                    var dispBuyPrice = "$" + round(nextItem.buyPrice, 2, true);
                    if (nextItem.isBulk) dispBuyPrice = "Bulk " + dispBuyPrice;
                    if (nextItem.buyCPM) dispBuyPrice = dispBuyPrice + "/1000";
                    dispBuyPrice = dispBuyPrice + " x";
                    newCartItem.find(".price").text(dispBuyPrice);
                    // if (nextItem.regularPrice) {
                    //     newCartItem.find(".regularPrice").text("$" + round(nextItem.regularPrice, 2, true)).css("display", "block");
                    // }
                    if (nextItem.buyCPM) newCartItem.find(".quantity").attr("max", "").attr("step", "1000");
                    newCartItem.find(".quantity").val(nextItem.quantity);

                    // if (nextItem.inventoryQuantity < nextItem.quantity) {
                    //     var newWishlistItem = newCartItem.clone(true);
                    //     newWishlistItem.find(".quantity").val(nextItem.quantity - nextItem.inventoryQuantity);
                    //     newWishlistItem.find(".quantity").inputSpinner({
                    //         buttonsClass: "btn-orange btn-orange-spinner"
                    //     });
                    //     newWishlistItem.appendTo("#wishlistItems");
                    // }

                    newCartItem.find(".quantity").inputSpinner({
                        buttonsClass: "btn-orange btn-orange-spinner"
                    });

                    var cartTarget = "#cartItems";
                    if (nextItem.buyCPM && customizations.buyOrderPaymentMethodModes) cartTarget = "#cartItemsCPM";
                    newCartItem.appendTo(cartTarget);
                }
            }
            validateCartContent(false, true);
        })
    } else {
        toggleBuyMode(false);
        getJSON("getCart", { cartID: cartID }, function (res) {
            var cartItems;
            if (res && res.result && res.result.cartItems) {
                cartItems = res.result.cartItems;
                gtagViewCart(cartItems);
            }
            populateCartContent(cartItems);
        });
    }
}

var updateCartItem = function (cartID, variantID, quantity) {
    if (cartID == "buy") {
        getJSON("updateBuyCartItem", { inventoryID: variantID, quantity: quantity }, function (res) {
            getCarts(false, undefined, cartID);
        });
    } else {
        getJSON("updateCartItem", { cartID: cartID, variantID: variantID, quantity: quantity }, function (res) {
            getCarts(false, undefined, cartID);
        });
    }
}

var addVariantToCart = function (event) {
    var variantBtn = event.target;
    var variantData;
    var inventoryID;
    var addQuantity;
    var isBuy = false;
    var cartID = defaultCartID;
    var shouldAnimate = false;
    var shouldAnimateIncCart = true;

    var multiItems;
    if ($(variantBtn).closest(".variant").is(".buyList")) {
        shouldAnimate = true;
        inventoryID = $(variantBtn).closest(".variant").data("inventoryID");
        addQuantity = 1;
        if (event.buyQty > 0) addQuantity = event.buyQty;
        isBuy = true;
    } else if ($(variantBtn).hasClass("quickAddBuyBtn")) {
        shouldAnimate = true;
        inventoryID = $(variantBtn).data("inventoryID");
        addQuantity = 1;
        if (event.buyQty > 0) addQuantity = event.buyQty;
        isBuy = true;
    } else if ($(variantBtn).hasClass("cartMenuBtn")) {
        multiItems = $(variantBtn).closest("#addCartsDropdown").data("addItems");
        cartID = $(variantBtn).data("cart").id;
        if (!multiItems) {
            shouldAnimate = true;
            shouldAnimateIncCart = false;
            variantData = $(variantBtn).closest("#addCartsDropdown").data("variant");
            addQuantity = $(variantBtn).closest("#addCartsDropdown").data("quantity");
            variantBtn = $(variantBtn).closest("#addCartsDropdown").data("senderBtn");
        }
    } else if ($(variantBtn).hasClass("quickAddBtn")) {
        shouldAnimate = true;
        variantData = $(variantBtn).data("variant");
        addQuantity = 1;
    } else if ($(event.target).closest(".deckOutput").length > 0) {
        //in the deck builder
        multiItems = getDeckBuilderItems();
    } else {
        shouldAnimate = true;
        variantData = $(variantBtn).closest(".variant").data("variant");
        addQuantity = parseInt($(variantBtn).closest(".variant").find(".quantity")[0].value);
    }
    // if (variantData.quantity === 0) {
    //     console.log("addVariantToCart: no stock, add with notification");
    // }

    if (multiItems) {
        console.log("add deckbuilder to cart:");
        console.log(multiItems);
        addToCartMulti(cartID, multiItems, true);
    } else {
        if (isBuy) {
            if (userLoggedIn) {
                getJSON("addToBuyCart", { inventoryID: inventoryID, quantity: addQuantity }, function (res) {

                })
            } else {
                messageBox("You must be logged in to sell your cards.");
                shouldAnimate = false;
            }
        } else {
            console.log("add cart: " + variantData.id + " quantity: " + addQuantity);
            var resData = $(variantBtn).closest(".searchResult").data("resData");
            addToCart(cartID, resData.inventoryID, variantData.id, variantData.variantCombinationID, addQuantity);
        }
    }
    if (shouldAnimate) {

        var sx = $(variantBtn).offset().left - $(document).scrollLeft();
        var sy = $(variantBtn).offset().top - $(document).scrollTop();
        var tx = $("#cartButton").offset().left - $(document).scrollLeft();
        var ty = $("#cartButton").offset().top - $(document).scrollTop();

        var prodImage = $(variantBtn).closest(".searchResult").find(".prodImage");
        var sImage = prodImage.attr("src");
        var sWidth = $(variantBtn).innerWidth();
        var sHeight = prodImage.innerHeight();
        var tWidth = $("#cartButton").outerWidth();
        var tHeight = $("#cartButton").innerHeight();
        var tScale = tWidth / sWidth;

        var fakeProdImage = $('<img class="fakeProdImage" src="' + sImage + '"></img>')
        fakeProdImage.appendTo("body");
        fakeProdImage.addClass('notransition');

        fakeProdImage.css('width', sWidth);//.css('height', sHeight);
        fakeProdImage.css('left', sx).css('top', sy);
        fakeProdImage[0].offsetHeight;
        fakeProdImage.removeClass('notransition');
        // fakeProdImage.css('width', tWidth);//.css('height', tHeight);
        fakeProdImage.css("transform", "scale(" + tScale + ")");//.css('height', tHeight);

        fakeProdImage.css('left', tx).css('top', ty);
        fakeProdImage.css("opacity", "0");
        window.setTimeout(function () {
            fakeProdImage.remove();
            if (shouldAnimateIncCart) incCartQty(addQuantity, isBuy);
        }, 800);
    }

};

var cartCount = 0;
var cartCountBuy = 0;

var setCartQty = function (cartQty, isBuy) {
    if (isBuy) {
        cartCountBuy = cartQty;
    } else {
        cartCount = cartQty;
    }

    var dispQty = cartQty;
    if (dispQty > 999) dispQty = Math.round(dispQty / 1000) + "k";
    if ((buyMode && isBuy) || (!buyMode && !isBuy)) $(".cartCount").attr("data-count", dispQty);
}

var incCartQty = function (delta, isBuy) {
    var oldCount = cartCount;
    if (isBuy) oldCount = cartCountBuy;
    oldCount += delta;
    if (isBuy) {
        cartCountBuy = oldCount;
    } else {
        cartCount = oldCount;
    }

    var dispQty = oldCount;
    if (dispQty > 999) dispQty = Math.round(dispQty / 1000) + "k";
    if ((buyMode && isBuy) || (!buyMode && !isBuy)) $(".cartCount").attr("data-count", dispQty);
}

var buyListToggle;
var buyListBulk = true;
var toggleBuyMode = function (forceMode) {
    if (!buyListToggle) {
        buyListToggle = $("#buyListToggle").closest(".toggleWrapper");
        buyListToggle.find("input").bootstrapToggle({ size: "small", onstyle: "orange", height: 28, width: 46.4531 });
        buyListToggle.find("input").change(function (event) {
            setTimeout(() => {
                toggleBuyMode(buyListToggle.find("input").prop("checked"));

            }, buyListToggle.closest("#searchHeader").length ? 1 : 500);
        })

        var buyListBulkToggle = $("#buyListBulkToggle").closest(".toggleWrapper");
        buyListBulkToggle.find("input").bootstrapToggle({ size: "small", onstyle: "orange", height: 28, width: 46.4531 });
        buyListBulkToggle.find("input").change(function (event) {
            buyListBulk = buyListBulkToggle.find("input").prop("checked");

            var currentRenderCache = searchRenderCache[currentRenderCacheID];
            if (currentRenderCache) {
                detachRenderCache(true);
                processSearchResultFilters(currentRenderCache);
                attachRenderCache(currentRenderCache, true);
            }
        })
    }

    if (window.location.host.includes("billandogres.")) {
        forceMode = true;
        buyListToggle.hide();
        $("#deckBuilderBtn").hide();
        $("#landingBestSellers").hide();
    }

    if (forceMode === undefined) {
        buyMode = !buyMode;
    } else {
        if (buyMode == forceMode) return;
        buyMode = forceMode;
    }
    $("body").toggleClass("buyMode", buyMode);
    buyListToggle.find("input").prop("checked", buyMode).change();

    setCartQty(buyMode ? cartCountBuy : cartCount, buyMode);
    $("#cartButton i").toggleClass("fa-hand-holding", buyMode).toggleClass("fa-shopping-cart", !buyMode);

    var currentRenderCache = searchRenderCache[currentRenderCacheID];
    if (currentRenderCache) {
        detachRenderCache(true);
        processSearchResultFilters(currentRenderCache);
        attachRenderCache(currentRenderCache, true);
    }
}
var mainMenuSearchToggle = function (showSearch) {
    if (showSearch) {
        $("#menuSearchText").hide();
        $("#menuSearch").show();
        $("#menuSearch").focus();
    } else {
        $("#menuSearch").val("");
        $('#mainMenu').jstree(true).search($("#menuSearch").val());
        $("#menuSearchText").show();
        $("#menuSearch").hide();
    }
}

var oldCategoriesDisplayCSS;
var mainMenuShow = function () {
    $("#mainMenu").jstree(true).close_all();
    mainMenuSearchToggle(false);

    oldCategoriesDisplayCSS = $("#categories").css("display");
    $("#categories").css("display", "none");
    $("#categories").css("visibility", "unset");

    // $("#categories").addClass("forceShow");
    highlightOverlay(["#categories"]);
}
var mainMenuHide = function (fastMode) {

    if (highlightSelectors.includes("#categories")) {
        highlightOverlayRemove(function () {
            // $("#categories").removeClass("forceShow");
            $("#categories").css("visibility", "");

            $("#categories").css("display", oldCategoriesDisplayCSS);

            $("#mainMenu").jstree(true).close_all();

            mainMenuSearchToggle(false);
        }, fastMode);
    }
}
var scrollToCategories = function () {
    var newTop = $("#categories").position().top - $("#floatHeader").outerHeight() - 4;
    window.scroll(window.scrollX, newTop);
}
var scrollToContent = function () {
    // window.scrollTo({ top: $("#headerRight").outerHeight(), behavior: "smooth" });
    var newTop = $("#rightContent").position().top - $("#rightHeader").outerHeight() - $("#floatHeader").height();
    var oldY = window.scrollY;
    //     if (newTop < oldY) {
    if (false /*window.scrollTo*/) {
        window.scrollTo({ top: newTop, behavior: "smooth" });
    } else {
        window.scroll(window.scrollX, newTop);
        if (window.scrollY !== newTop) {
            window.scroll(window.scrollX, 0);
        }
        //         }
    }
}

var test = function () {
    var cognitoUser = getCognitoUser();
    var sess = cognitoUser.getSession(function (error, result) {
        console.log("getSession:");
        console.log(error);
        console.log(result);
        var attributeList = [];
        var attribute = {
            Name: 'email',
            Value: "new" + result.idToken.payload.email
        };
        var attribute = new AmazonCognitoIdentity.CognitoUserAttribute(attribute);
        attributeList.push(attribute);

        cognitoUser.updateAttributes(attributeList, function (err, result) {
            if (err) {
                alert(err);
                return;
            }
            console.log('call result: ' + result);
        });

    });
}

var userLoggedIn = false;
var checkoutProgressAccountTab
var updateUserDisplay = function (loggedIn) {
    userLoggedIn = loggedIn;
    if (loggedIn) {
        $(".loginBtn").hide();
        $(".registerBtn").hide();
        $(".logoutBtn").show();
        $(".myAccountBtn").show();
        $("#mobileMenuLogin").hide();
        $("#mobileMenuRegister").hide();
        $("#mobileMenuAccount").show();
        $("#mobileMenuLogout").show();

        $("#applyStoreCreditPayment").show();

        $(".addCartBtnWrapper").addClass("multi");
        if (resOrigParts.variant) resOrigParts.variant.find(".addCartBtnWrapper").addClass("multi");
    } else {
        localStorage.ccCurrentUserEmail = undefined;
        $(".loginBtn").show();
        $(".registerBtn").show();
        $(".logoutBtn").hide();
        $(".myAccountBtn").hide();
        $("#mobileMenuLogin").show();
        $("#mobileMenuRegister").show();
        $("#mobileMenuAccount").hide();
        $("#mobileMenuLogout").hide();

        $("#applyStoreCreditPayment").hide();

        $(".addCartBtnWrapper").removeClass("multi");
        if (resOrigParts.variant) resOrigParts.variant.find(".addCartBtnWrapper").removeClass("multi");
    }
}

var loginUser = function (username, password, inCheckout, keepOverlayOnSuccess) {
    username = username.toLowerCase();
    if (inCheckout) {
        $("#checkoutLoginForm .submitIcon").removeClass("fa-lock").addClass("fa-spinner fa-pulse").closest("button").prop("disabled", true);;

    } else {
        $(".loginBox .submitIcon").removeClass("fa-lock").addClass("fa-spinner fa-pulse").closest("button").prop("disabled", true);
    }

    var userPool = new AmazonCognitoIdentity.CognitoUserPool({
        UserPoolId: userPoolID,
        ClientId: appClientID
    });
    var cognitoUser = new AmazonCognitoIdentity.CognitoUser({
        Username: username,
        Pool: userPool
    });

    var authDetails = new AmazonCognitoIdentity.AuthenticationDetails({
        Username: username,
        Password: password
    });

    // Authenticate user
    cognitoUser.authenticateUser(authDetails, {
        onSuccess: (result => {

            console.log("authenticateUser success:");
            console.log(result);
            gtagLogin();
            updateUserDisplay(true);
            if (!keepOverlayOnSuccess) highlightOverlayRemove();
            getCarts(false);

            if (inCheckout) {
                getJSON("checkout.claimOrder", { orderID: checkoutOrderID }, function (res) {
                    if (res && res.success) {
                        var itemsMissing;
                        var itemsRemoved;
                        var error36 = res.errors.find(v => v.code == 36);
                        if (error36) {
                            itemsMissing = error36.itemsMissing;
                            itemsRemoved = error36.itemsRemoved;
                        }
                        populateOrderSummary(res.result.orderID, res.result.items, res.result.preorderDate, itemsMissing, itemsRemoved, res.result.coupons);
                        $("#checkoutLoginForm .submitIcon").addClass("fa-lock").removeClass("fa-spinner fa-pulse").closest("button").prop("disabled", false);
                        doCheckout("summary");
                    } else {

                    }
                })
            } else {
                $(".loginBox .submitIcon").addClass("fa-lock").removeClass("fa-spinner fa-pulse").closest("button").prop("disabled", false);
                loadStorePath(true);
            }
        }),
        onFailure: function (err) {
            var emailBox = email;
            var passwordBox = password;
            if (inCheckout) {
                $("#checkoutLoginForm .submitIcon").addClass("fa-lock").removeClass("fa-spinner fa-pulse").closest("button").prop("disabled", false);
                $("#checkoutLoginForm").effect("shake");
                emailBox = checkoutLoginEmail;
                passwordBox = checkoutLoginPassword;
            } else {
                $(".loginBox .submitIcon").addClass("fa-lock").removeClass("fa-spinner fa-pulse").closest("button").prop("disabled", false);
                $(".loginBox").effect("shake");
            }

            console.log(err);
            updateUserDisplay(false);
            if (err) {
                if (err.code === "PasswordResetRequiredException") {
                    messageBox("A password reset is required before you can login.  Click <span style='font-weight: bold'>ok</span> to send a reset link to the registered e-mail address.", {
                        onSubmit: function (doneCallback) {
                            requestPasswordReset(username);
                        }
                    })
                    console.log("send password reset");
                } else if (err.code === "UserNotFoundException") {
                    $(emailBox).css("border-color", "red");
                    $(emailBox).closest("label").find(".formError:eq(1)").slideDown();
                    $(emailBox).focus();
                } else {
                    $(emailBox).css("border-color", "");
                    $(emailBox).closest("label").find(".formError:eq(1)").slideUp();
                }
                if (err.code === "NotAuthorizedException") {
                    $(passwordBox).css("border-color", "red");
                    $(passwordBox).closest("label").find(".formError:eq(1)").slideDown();
                    $(passwordBox).focus();

                } else {
                    $(passwordBox).css("border-color", "");
                    $(passwordBox).closest("label").find(".formError:eq(1)").slideUp();
                }
                console.log(err);

            }

        }
    });

}

var logoutUser = function () {
    getCognitoUser().signOut();
    updateUserDisplay(false);
    loadStorePath(true);
    getCarts(false);
}

var changePassword = function (oldPassword, newPassword) {
    var cognitoUser = getCognitoUser();
    cognitoUser.getSession(function (err, session) {
        console.log(cognitoUser);
        console.log(session);
        cognitoUser.changePassword(oldPassword, newPassword, function (err, res) {
            console.log(err);
            console.log(res);

            if (err) {
                // if (err.code === "NotAuthorizedException") {
                $(currentPassword).css("border-color", "red");
                $(currentPassword).closest("label").find(".formError:eq(1)").slideDown();
                $(currentPassword).focus();
                // }
                if (err.code === "LimitExceededException") {
                    messageBox("Too many attempts.  Please try again later.");
                }
            } else {
                messageBox("Your password has been changed.");
                $("#currentPassword").val("");
                $("#newPassword").val("");

                $("#accountUserDetails input").css("border-color", "");
                $("#accountUserDetails .formError").hide();

            }
        })
    })
}
var highlightSelectors = [];
var highlightOverlay = function (selectors, clear) {
    $(".fadeOverlay").css("background", clear ? "transparent" : "");

    selectors.push(".fadeOverlay");
    selectors.forEach(function (val) {
        $(val).fadeIn(250);
        highlightSelectors.push(val);
    });
}

var messageBox = function (htmlMessage, params) {
    // params = {
    //     showInput: true/false,
    //     inputDefaultVal: "banana",
    //     inputMinLength: 6,
    //     inputType: "password",
    //     onSubmit: function(inputValue, closeMessageBox),
    // }
    if (!params) params = {};

    if (!highlightSelectors.includes("#messageBox")) {
        highlightOverlayRemove();
    }

    if (!params.inputDefaultVal) params.inputDefaultVal = "";
    $("#messageBoxInput").val(params.inputDefaultVal);
    $("#messageBoxInput").toggle(!!params.showInput);
    $("#messageBoxInput").prop("required", !!params.showInput);
    if (!params.inputMinLength) params.inputMinLength = 1;
    $("#messageBoxInput").attr("minlength", params.inputMinLength);
    if (!params.inputType) params.inputType = "text";
    $("#messageBoxInput").attr("type", params.inputType);

    $("#submitMessageBox").removeClass("disabled");
    $("#submitMessageBox .fas").removeClass("fa-spinner fa-pulse");

    highlightOverlay(["#messageBox"]);
    if (params.showInput) {
        $("#messageBoxInput").select().focus();
    } else {
        $("#submitMessageBox").focus();
    }

    $("#messageBoxText").html(htmlMessage);
    $("#messageBoxContent").off("submit");
    var closeMessageBox = function () {
        highlightOverlayRemove();
    }
    $("#messageBoxContent").submit(function (event) {
        event.preventDefault();

        if (params.onSubmit) {
            $("#submitMessageBox").addClass("disabled");
            $("#submitMessageBox .fas").addClass("fa-spinner fa-pulse");

            var inputValue = $("#messageBoxInput").val();
            params.onSubmit(inputValue, closeMessageBox);
        } else {
            closeMessageBox();
        }
    })
}

var resetCartBtn;
var resetCartBtnText;
var highlightOverlayRemove = function (onCompleteItem, fastMode) {
    highlightSelectors.forEach(function (val) {
        $(val).fadeOut(fastMode ? 1 : 250, onCompleteItem);

    });

    highlightSelectors = [];
    if (resetCartBtn) {
        resetCartBtn[0].innerText = resetCartBtnText;
        resetCartBtn = undefined;
        resetCartBtnText = undefined;
    }
}

var createAddress = function (addressID, firstName, lastName, address1, address2, city, state, zip, country, phone) {
    var data = {
        firstName: firstName,
        lastName: lastName,
        address1: address1,
        address2: address2,
        city: city,
        state: state,
        zipCode: zip,
        country: country,
        phoneNumber: phone,
        company: ""
    }
    var api = "addAddress";
    var iconName = "fa-plus";
    if (addressID) {
        api = "updateAddress";
        iconName = "fa-check";
        data.addressID = addressID;
    }

    $("#submitNewAddress .submitIcon").removeClass(iconName).addClass("fa-spinner fa-pulse");
    $("#submitNewAddress").addClass("disabled");
    $("#deleteAddress").addClass("disabled");
    $("#addNewAddressBtn").addClass("disabled");



    getJSON(api, data, function (res) {
        $("#submitNewAddress .submitIcon").addClass(iconName).removeClass("fa-spinner fa-pulse");
        $("#submitNewAddress").removeClass("disabled");
        getAddresses();
    })
}

var mobileMenuShow = function () {
    $("#mobileMenu").addClass("showing");
    setTimeout(() => {
        $("#mobileMenu").addClass("color");
        // $("#menuWrapper").toggle("slide");
        $("#menuWrapper").show("slide", { direction: "left" }, 200);
    }, 1);
}
var mobileMenuHide = function (fastMode) {
    if ($("#mobileMenu").is(":visible")) {
        $("#mobileMenu").removeClass("color");
        $("#menuWrapper").hide("slide", { direction: "left" }, fastMode ? 1 : 200, function () {
            $("#mobileMenu").removeClass("showing");
        });
    }
}

var getCheckoutUserFields = function () {
    res = [];
    var checkoutUserFieldInputs = $("#checkoutInformationRequiredFieldItems input.userFieldTextInput");
    for (nextInput of checkoutUserFieldInputs) {
        res.push({
            orderItemID: $(nextInput).closest(".requiredFieldsItem").data("orderItemID"),
            userFieldID: parseInt($(nextInput).attr("userFieldID")),
            value: $(nextInput).val().trim()
        })
    }
    return res;

}
var getCheckoutCustomerComment = function () {
    var customerComment = "";
    if ($("#checkoutSummaryFields label").length) {
        for (nextField of $("#checkoutSummaryFields label").toArray()) {
            if (customerComment.length) customerComment += "\n";
            nextField = $(nextField);
            customerComment += nextField.text().trim() + ": ";
            customerComment += nextField.find("input").val().trim();
        }
    }
    if ($("#checkoutCustomerCommentEnable").prop("checked")) {
        if (customerComment.length) customerComment += "\n";
        customerComment += $("#checkoutCustomerComment").val().trim();
    }
    if (customerComment.trim().length == 0) customerComment = undefined;
    return customerComment;
}

var resizeViewport = function () {
    // alert($("body")[0].getBoundingClientRect().width);
    // alert(window.devicePixelRatio);
    if (screen.width >= 980) {
        // $("#viewport").removeAttr("content");
        $("#viewport").attr("content", "width=device-width");

    } else {
        var w = Math.min(screen.width, screen.height);
        var h = Math.max(screen.width, screen.height);

        var landscape = w < h ? false : true;
        if (Math.abs(window.orientation) === 90) landscape = true;

        console.log("landscape: " + landscape);
        // $("#container").hide();
        if (landscape) {
            var other = Math.max(450, w);
            // $("#viewport").attr("content", "width=device-width, minimum-scale=1, maximum-scale=1, initial-scale=0.86");
            $("#viewport").attr("content", "width=" + Math.max(450, Math.round((other / w) * h)));
        } else {
            // $("#viewport").attr("content", "width=device-width, minimum-scale=1, maximum-scale=1, initial-scale=0.86");
            $("#viewport").attr("content", "width=" + Math.max(450, w));

        }
    }
    // console.log("width: " + window.innerWidth);
    // console.log("height: " + window.innerHeight);
    // $("#topMenu > a:nth-child(2)").text(window.innerWidth);
    // $("#topMenu > a:nth-child(3)").text(window.innerHeight);
    // $("#topMenu > a:nth-child(4)").text($("#viewport").attr("content"));
    // $("#topMenu > a:nth-child(5)").text(screen.width);
    // $("#topMenu > a:nth-child(6)").text(screen.height);
    // $("#topMenu > a:nth-child(7)").text(w);
    // $("#topMenu > a:nth-child(8)").text(h);
}

var resizeEquivalentItems = function () {
    $("#equivalentItems").css("max-height", $("#itemDetails .searchResult").outerHeight() + "px");

    var relatedMaxWidth = $("#itemDetails").width();
    if ($("#equivalentItems").is(":visible")) {
        relatedMaxWidth += $("#equivalentItems").width() + 6;
    }
    $("#relatedItems").css("max-width", relatedMaxWidth + "px");
}

var resizeSearchFilterPanel = function () {
    // var newTop = $("#rightContent").position().top;
    // $("#searchFilterPanel").css("top", newTop);
    // // $("#searchFilterPanel").css("left", $("#rightContent").position().left);

    // var searchHeader = $("#searchHeader");
    // var searchHeaderHeight = searchHeader.outerHeight();
    // var stickyTop = $("#floatHeaderGrid").outerHeight() + searchHeaderHeight;
    // $("#searchFilterPanelContents").css("top", stickyTop)
    //     .css("max-height", window.innerHeight - searchHeaderHeight - searchHeader.offset().top);


    var newTop = $("#rightContent").position().top;
    $("#searchFilterPanel").css("top", newTop);
    // $("#searchFilterPanel").css("left", $("#rightContent").position().left);

    var searchHeader = $("#searchHeader");
    var searchHeaderHeight = searchHeader.outerHeight();
    var stickyTop = $("#floatHeaderGrid").outerHeight() + searchHeaderHeight;
    $("#searchFilterPanelContents").css("top", stickyTop);

    setTimeout(function () {
        $("#searchFilterPanelContents").css("max-height", window.innerHeight - $("#searchFilterPanelContents")[0].getBoundingClientRect().top);
    }, 1);

}

var gtag;
var gTagPurchase = function (orderDetails) {
    if (!gtag) return;

    var taxTotal = orderDetails.taxes.map(v => v.amount).reduce((a, b) => a + b, 0);
    var itemsArray = [];
    for (nextItem of orderDetails.items) {
        itemsArray.push({
            item_id: nextItem.inventoryID,
            item_name: nextItem.name,
            item_category: nextItem.categoryName,
            item_variant: nextItem.variantName,
            price: nextItem.price,
            discount: nextItem.discount,
            quantity: nextItem.quantity
        })
    }
    var gtagData = {
        transaction_id: orderDetails.orderID,
        value: orderDetails.subtotal,
        tax: taxTotal,
        shipping: orderDetails.shippingPrice,
        currency: storeCurrency,
        items: itemsArray
    }
    gtag('event', 'purchase', gtagData);
}

var gTagAddToCart = function (items) {
    if (!gtag) return;

    var gtagItems = [];
    for (nextItem of items) {
        gtagItems.push({
            item_id: nextItem.variantID,
            quantity: nextItem.quantity
        })
    }
    var gtagData = {
        items: gtagItems
    }
    gtag("event", "add_to_cart", gtagData);
}

var gtagViewCart = function (cartItems) {
    if (!gtag) return;
    // console.log(cartItems);

    var gtagItems = [];
    for (nextItem of cartItems.items) {
        gtagItems.push({
            item_id: nextItem.variantID,
            quantity: nextItem.quantity,
            price: nextItem.price,
            item_name: nextItem.name,
            item_category: nextItem.categoryName,
            item_variant: nextItem.variantName
        })
    }
    var gtagData = {
        currency: storeCurrency,
        value: gtagItems.map(v => v.quantity * v.price).reduce((a, b) => a + b, 0),
        items: gtagItems
    }
    gtag("event", "view_cart", gtagData);
}

var gtagBeginCheckout = function (orderItems) {
    if (!gtag) return;
    // console.log(orderItems);

    var gtagItems = [];
    for (nextItem of orderItems) {
        gtagItems.push({
            item_id: nextItem.variantID,
            quantity: nextItem.quantity,
            price: nextItem.price,
            item_name: nextItem.name,
            item_category: nextItem.categoryName,
            item_variant: nextItem.variantName
        })
    }
    var gtagData = {
        currency: storeCurrency,
        value: gtagItems.map(v => v.quantity * v.price).reduce((a, b) => a + b, 0),
        items: gtagItems
    }
    gtag("event", "begin_checkout", gtagData);
}

var gtagSignUp = function () {
    if (!gtag) return;
    gtag("event", "sign_up");
}

var gtagLogin = function () {
    if (!gtag) return;
    gtag("event", "login");
}

var gtagSearch = function (searchTerm) {
    if (!gtag) return;
    if (searchTerm) gtag("event", "search", { search_term: searchTerm });
}

var addressDropdown;
var selectedAddressID;
var createBuyOrderMode = "all";
var noLoginEmail;
var categories = [];
$(document).ready(function () {
    sharedReady();
    console.log("ready!");
    resizeViewport();


    loadCookies();
    $(window).bind("scroll", function () {
        checkFoilViewports();
    });

    buyOrderStatusMap["accepted"] = "Complete";

    orderDetailsTable = $("#orderInfoTable");
    orderDetailsTable.detach();

    withinviewport.defaults.top = -360;
    withinviewport.defaults.bottom = -360;
    withinviewport.defaults.sides = "top bottom";

    $.jMaskGlobals.dataMask = false;
    $.jMaskGlobals.watchInterval = 9999;
    $.jMaskGlobals.watchInputs = false;
    $.jMaskGlobals.watchDataMask = false;

    $(window).resize(function (event) {
        resizeViewport();
        resizeSliders();
        resizeCarousel(true);
        checkCategoriesHeight();
        if (window.innerWidth >= 980) {
            mainMenuHide(true);
            mobileMenuHide(true);
        }
        if ($("#searchFilterPanel").is(":visible")) {
            resizeSearchFilterPanel();
        }
        resizeEquivalentItems();
    })

    document.addEventListener("visibilitychange", function (event) {
        console.log(event);
        $("body").toggleClass("pauseFoilOverlay", document.hidden);
    }, false);

    $("#landingTabs").on("shown.bs.tab", function (event) {
        pauseLandingBanners()
        playLandingBanner();
    })
    $("#checkoutCustomerCommentEnable").change(function (event) {
        var isChecked = $("#checkoutCustomerCommentEnable").prop("checked");
        $("#checkoutCustomerComment").toggle(isChecked);
    })
    $("#checkoutBuyCustomerCommentEnable").change(function (event) {
        var isChecked = $("#checkoutBuyCustomerCommentEnable").prop("checked");
        $("#checkoutBuyCustomerComment").toggle(isChecked);
    })
    $("#topMenu").on("click", ".pagesLink", function (event) {
        event.preventDefault();
        var section = $(event.target).attr("pagestarget");
        console.log("pages: " + section);
        doPages(section);
    })

    $("#changePasswordForm").submit(function (event) {
        event.preventDefault();

        var oldPassword = $("#currentPassword").val();
        var newPassword = $("#newPassword").val();

        hasError = false;

        if (newPassword.length < 6) {
            $("#newPassword").css("border-color", "red");
            $("#newPassword").closest("label").find(".formError:eq(0)").slideDown();
            $("#newPassword").focus();
            hasError = true;
        } else {
            $("#newPassword").css("border-color", "");
            $("#newPassword").closest("label").find(".formError:eq(0)").slideUp();
        }

        if (oldPassword.length == 0) {
            $("#currentPassword").css("border-color", "red");
            $("#currentPassword").closest("label").find(".formError:eq(0)").slideDown();
            $("#currentPassword").closest("label").find(".formError:eq(1)").hide();

            $("#currentPassword").focus();
            hasError = true;
        } else {
            $("#currentPassword").css("border-color", "");
            $("#currentPassword").closest("label").find(".formError:eq(0)").slideUp();
        }

        if (!hasError) changePassword(oldPassword, newPassword);
    })
    $("#upcomingEventsLink").click(function (event) {
        event.preventDefault();
        if (upcomingEventsImageURL) {
            var newViewer = new Viewer(this, {
                button: false,
                zIndex: 10000,
                toolbar: false,
                title: false,
                navbar: false,
                url(image) {
                    return upcomingEventsImageURL;
                },
                hidden() {
                    this.viewer.destroy();
                }
            })
            newViewer.show();
        }
    })
    $("#forgotPasswordLink, #forgotPasswordLinkCheckout, #forgotPasswordLinkAccount").click(function (event) {
        event.preventDefault();

        var inputEmail = $("#email").val();
        if ($(event.target).is("#forgotPasswordLinkCheckout")) {
            inputEmail = $("#checkoutLoginEmail").val();
        }

        messageBox("Enter your e-mail address to reset your password.", {
            showInput: true,
            inputType: "email",
            inputDefaultVal: inputEmail,
            onSubmit: function (inputVal) {
                requestPasswordReset(inputVal);
            }
        });
    })
    $("#mobileCategoriesBtn").click(function (event) {
        mainMenuShow();
    })
    $("#mainMenu").click(function (event) {
        // highlightOverlayRemove(function () {
        //     $("#categories").removeClass("forceShow");

        //     $("#mainMenu").jstree(true).close_all();

        // });
        if ($(event.target).is("#mainMenu")) {
            mainMenuHide();
        }
    })
    $("#menuWrapper").hide();
    $("#floatHeaderHamburger").click(function (event) {
        mobileMenuShow();
    })
    $("#mobileMenu").click(function (event) {
        if ($(event.target).is("#mobileMenu")) {
            mobileMenuHide();
        }
    })
    $("#mobileMenuLogin").click(function (event) {
        mobileMenuHide();
        $(".loginBtn").click();
    })
    $("#mobileMenuRegister").click(function (event) {
        mobileMenuHide();
        $(".registerBtn").click();
    })
    $("#mobileMenuAccount").click(function (event) {
        mobileMenuHide();
        doAccountDetails("user");
    })
    $("#mobileMenuLogout").click(function (event) {
        mobileMenuHide();
        logoutUser();
    })
    $("#mobileMenuHome").click(function (event) {
        mobileMenuHide();
        doHome();
    })
    $("#menuFooter").click(function (event) {
        mobileMenuHide();
        doAccountDetails("credit");
    })
    $("#mobileMenuAdvancedSearch").click(function (event) {
        mobileMenuHide();
        loadSearch();
    })
    $("#mobileMenuDeckBuilder").click(function (event) {
        mobileMenuHide();
        doDeckBuilder();
    })
    $("#mobileMenuCart").click(function (event) {
        mobileMenuHide();
        doCart();
    })
    $("#mobileMenuCategories").click(function (event) {
        mobileMenuHide();
        mainMenuShow();
    })


    $("#checkoutPaymentAddressSame").change(function (event) {
        var sameAsShipping = $("#checkoutPaymentAddressSame").prop("checked");
        $("#checkoutBillingAddressWrapper").toggle(!sameAsShipping);
    })
    $("#checkoutPaymentAddressSameStripe").change(function (event) {
        var sameAsShipping = $("#checkoutPaymentAddressSameStripe").prop("checked");
        $("#checkoutBillingAddressWrapperStripe").toggle(!sameAsShipping);
    })
    $("#checkoutPayment #checkoutCreditAmount").focus(function (event) {
        $(this).select();
    })
    $("#checkoutPayment #paymentTypeCard, #checkoutPayment #paymentTypePayPal, #paymentTypePayLater").change(function (event) {
        var cardSelected = $("#checkoutPayment #paymentTypeCard").prop("checked");
        var paypalSelected = $("#paymentTypePayPal").prop("checked");
        var paylaterSelected = $("#paymentTypePayLater").prop("checked");
        if (customizations.stripePublishableKey) {
            $("#checkoutPayment #stripeCCPaymentWrapper").toggle(cardSelected);
            $("#checkoutPayment #ccPaymentWrapper").hide();
        } else {
            $("#checkoutPayment #ccPaymentWrapper").toggle(cardSelected);
            $("#checkoutPayment #stripeCCPaymentWrapper").hide();
        }

        $("#checkoutPayment .paypalWrapper").toggle(paypalSelected);
        $("#checkoutPayment .payLaterWrapper").toggle(paylaterSelected);

    })
    $("#paymentBuyTypeStoreCredit, #paymentBuyTypeInterac, #paymentBuyTypePayPal, #paymentBuyTypeCheque, #paymentBuyTypeCheck, #paymentBuyTypeVenmo, #paymentBuyTypeZelle, #paymentBuyTypeCash").change(function (event) {
        var storeCreditSelected = $("#paymentBuyTypeStoreCredit").prop("checked");
        var interacSelected = $("#paymentBuyTypeInterac").prop("checked");
        var paypalSelected = $("#paymentBuyTypePayPal").prop("checked");
        var chequeSelected = $("#paymentBuyTypeCheque").prop("checked");
        var checkSelected = $("#paymentBuyTypeCheck").prop("checked");
        var venmoSelected = $("#paymentBuyTypeVenmo").prop("checked");
        var zelleSelected = $("#paymentBuyTypeZelle").prop("checked");
        var cashSelected = $("#paymentBuyTypeCash").prop("checked");
        $("#checkoutBuyPaymentStoreCredit").toggle(storeCreditSelected);
        $("#checkoutBuyPaymentInterac").toggle(interacSelected);
        $("#checkoutBuyPaymentPayPal").toggle(paypalSelected);
        $("#checkoutBuyPaymentCheque").toggle(chequeSelected);
        $("#checkoutBuyPaymentCheck").toggle(checkSelected);
        $("#checkoutBuyPaymentVenmo").toggle(venmoSelected);
        $("#checkoutBuyPaymentZelle").toggle(zelleSelected);
        $("#checkoutBuyPaymentCash").toggle(cashSelected);

        $("#checkoutBuyPaymentInterac input").attr("required", interacSelected);
        $("#checkoutBuyPaymentPayPal input").attr("required", paypalSelected);
        $("#checkoutBuyPaymentVenmo input").attr("required", venmoSelected);
        $("#checkoutBuyPaymentZelle input").attr("required", zelleSelected);

    })
    $("#checkoutProgress .checkoutTab").click(function (event) {
        if (!$(event.currentTarget).hasClass("disabled") && !$(event.currentTarget).hasClass("active")) {
            var target = $(event.currentTarget).attr("target");

            console.log(target);
            doCheckout(target);
        }
    })
    $("#checkoutBuyProgress .checkoutTab").click(function (event) {
        if (!$(event.currentTarget).hasClass("disabled") && !$(event.currentTarget).hasClass("active")) {
            var target = $(event.currentTarget).attr("target");

            console.log(target);
            doCheckoutBuy(target);
        }
    })
    $("#buyOrderInfoGradedEditBtn").click(function (event) {
        populateBuyOrderDetails($("#buyOrderInfo"), $("#buyOrderInfoTable").data("order"), true);
    })
    $("#buyOrderInfoGradedAcceptBtn").click(function (event) {
        if ($(event.target).hasClass("disabled")) return;

        $("#buyOrderInfoGradedAcceptBtn, #buyOrderInfoGradedEditBtn").addClass("disabled");
        var orderInfo = $("#buyOrderInfoTable").data("order");
        var removeIDs = [];
        var checkboxes = $("#buyOrderInfo").find("input:checked").toArray();
        for (checkbox of checkboxes) {
            var itemID = $(checkbox).closest("tr").data("itemID");
            removeIDs.push(itemID);
        }
        console.log(orderInfo.buyOrderID);
        console.log(removeIDs);
        getJSON("acceptBuyOrder", { buyOrderID: orderInfo.buyOrderID, rejectedGradeIDs: removeIDs }, function (res) {
            if (res.success && res.result) {
                populateBuyOrderDetails($("#buyOrderInfo"), res.result);
            }
        })

    })
    $("#checkoutAcceptSummaryForm").submit(function (event) {
        event.preventDefault();
        if ($("#checkoutProgressInformationRequiredTab").is(":visible")) {
            doCheckout("informationRequired");
        } else {
            doCheckout("address");
        }
    })
    $("#checkoutInformationRequiredForm").submit(function (event) {
        event.preventDefault();

        if (userLoggedIn) {
            var saveUserFieldsChecked = $("#checkout .saveFieldLabel input:checked").toArray();
            var updatedFields = [];
            for (nextCheck of saveUserFieldsChecked) {
                var thisInputText = $(nextCheck).closest(".itemRequiredField").find(".userFieldTextInput");
                updatedFields.push({
                    userFieldID: parseInt(thisInputText.attr("userFieldID")),
                    value: thisInputText.val().trim()
                })
            }
            console.log(updatedFields);

            if (updatedFields.length > 0) {
                getJSON("updateUserFields", { userFields: updatedFields }, function (res) {
                })
            }
        }
        doCheckout("address");
    })
    $("#checkoutInformationRequiredForm").on("blur", ".userFieldTextInput", function (event) {
        var currentInput = event.currentTarget;
        var currentText = $(currentInput).val().trim();
        var currentFieldID = $(currentInput).attr("userFieldID");

        var userFieldTextInputs = $("#checkoutInformationRequiredForm .userFieldTextInput").toArray();
        userFieldTextInputs = userFieldTextInputs.filter(v => $(v).val().trim() == "" && $(v).attr("userFieldID") == currentFieldID);
        $(userFieldTextInputs).val(currentText);
    })
    $("#checkoutBuy #acceptBuySummaryBtn").click(function (event) {
        doCheckoutBuy("address");
    })
    $("#checkoutBuySelectAddressBtn").click(function (event) {
        if ($(this).hasClass("disabled")) return;

        checkoutShippingAddressID = selectedAddressID;
        if (checkoutShippingAddressID) {
            doCheckoutBuy("payment");
        }
    })
    $("#buyPaymentForm").submit(function (event) {
        event.preventDefault();
        var paymentMethodName = $("#buyPaymentForm input[name='paymentBuy-option']:checked").val();
        var paymentMethodDest = "";
        if (paymentMethodName == "interac") paymentMethodDest = $("#checkoutBuyPaymentInteracAddress").val();
        if (paymentMethodName == "paypal") paymentMethodDest = $("#checkoutBuyPaymentPayPalAddress").val();
        if (paymentMethodName == "zelle") paymentMethodDest = $("#checkoutBuyPaymentZelleUsername").val();
        if (paymentMethodName == "venmo") paymentMethodDest = $("#checkoutBuyPaymentVenmoPhoneNumber").val();

        var customerCommentBuyOrder;
        if ($("#checkoutBuyCustomerCommentEnable").prop("checked")) customerCommentBuyOrder = $("#checkoutBuyCustomerComment").val();

        $("#submitBuyOrderBtn").attr("disabled", true);
        getJSON("createBuyOrder", { paymentType: paymentMethodName, paymentDestination: paymentMethodDest, addressID: selectedAddressID, customerComment: customerCommentBuyOrder, onlyMode: createBuyOrderMode }, function (res) {
            if (res && res.result && res.result.buyOrderID) {
                setCartQty(0, true);
                doAccountDetails("buyorders", res.result.buyOrderID);
                getCarts(false);
            }
        })
    })
    $("#checkout .checkoutSelectAddressBtn").click(function (event) {
        if ($(this).hasClass("disabled")) return;

        checkoutShippingAddressDetails = undefined;
        checkoutShippingAddressID = selectedAddressID;
        if (checkoutShippingAddressID) {
            var shippingMethods = $("#shippingMethods .shipingMethodItems");
            shippingMethods.empty();
            $(`<tr><td colspan="2">
                <div class="loadingShippingMethods">
                    <i class="fas fa-spinner fa-pulse"></i>Finding Shipping Methods...
                </div>
            </td></tr>`).appendTo(shippingMethods);
            doCheckout("shippingMethod");
            $("#checkoutShippingMethod .checkoutSelectShippingMethodBtn").addClass("disabled");

            checkoutShippingAddressDetails = addressDropdown[0].selectize.options[checkoutShippingAddressID];
            getJSON("checkout.updateOrderShippingAddress", { orderID: checkoutOrderID, addressID: checkoutShippingAddressID }, function (res) {
                if (res && res.success && res.result) {
                    shippingMethods.empty();
                    res.result.sort((a, b) => {
                        var res = b.isStorePickup - a.isStorePickup;
                        if (res == 0) {
                            res = a.isEventPickup - b.isEventPickup;
                            if (res == 0) {
                                res = a.price - b.price;
                            }
                        }

                        return res;
                    })
                    for (method of res.result) {
                        var servicePrice = round(method.price, 2, true, true, true);
                        if (method.price == 0) servicePrice = "Free";
                        if (method.shippingCarrierDisplayName || method.shippingServiceDisplayName) {
                            if (method.shippingCarrierDisplayName == "UPSDAP") method.shippingCarrierDisplayName = "UPS";

                            var shippingDisplayNameParts = [];
                            if (method.shippingCarrierDisplayName) shippingDisplayNameParts.push(method.shippingCarrierDisplayName);
                            if (method.shippingServiceDisplayName) shippingDisplayNameParts.push(method.shippingServiceDisplayName);

                            var serviceName = shippingDisplayNameParts.join(" - ");
                            if (method.shippingCustomerLabel) serviceName = `${serviceName}<br><span>${method.shippingCustomerLabel}</span>`;
                            serviceName = `<div class="checkoutShippingMethod">${serviceName}</div>`;

                            $(`<tr><td class="noRightBorder"><label><input type="radio" name="checkoutShippingMethod" value="${method.id}">&nbsp${serviceName}</label></td><td class="rightAlign minWidth noLeftBorder">${servicePrice}</td></tr>`).appendTo(shippingMethods);
                        } else {
                            $(`<tr><td class="noRightBorder"><label><input type="radio" name="checkoutShippingMethod" value="${method.id}">&nbsp${method.name}</label></td><td class="rightAlign minWidth noLeftBorder">${servicePrice}</td></tr>`).appendTo(shippingMethods);
                        }
                    }
                    if (res.warnings) {
                        var easyPostWarnings = res.warnings.find(v => v.code == 107);
                        if (easyPostWarnings) {
                            var connectionTimeouts = easyPostWarnings.data.filter(v => v.message.includes("timed out"));
                            for (nextTimeout of connectionTimeouts) {
                                $(`<tr><td class="noRightBorder"><label>${formatCamelText(nextTimeout.carrier)} rates error.  Please try again later.</label></td><td class="rightAlign minWidth noLeftBorder"></td></tr>`).appendTo(shippingMethods);
                            }
                        }
                    }
                } else {
                    shippingMethods.empty();
                    $(`<tr><td colspan="2">
                        <div class="loadingShippingMethods">
                            <i class="fas fa-exclamation-triangle" style="color: red; text-shadow: 0px 0px 2px black;"></i>
                            Error loading shipping methods.
                            <div class="flexBreak"></div>
                            <div class="btn btn-orange" id="retryShippingMethodsBtn">Retry</div>
                        </div>
                    </td></tr>`).appendTo(shippingMethods);
                    shippingMethods.find("#retryShippingMethodsBtn").click(function (event) {
                        $("#checkout .checkoutSelectAddressBtn").click();
                    })
                }
            })
        }
    })


    $("#shippingMethods").on("click", "input", function (event) {
        var methodID = parseInt($("#shippingMethods input[type=radio]:checked").val());
        if (methodID) {
            $("#checkoutShippingMethod .checkoutSelectShippingMethodBtn").removeClass("disabled");
        }
    })

    $("#checkout .checkoutSelectShippingMethodBtn").click(function (event) {
        var methodID = parseInt($("#shippingMethods input[type=radio]:checked").val());

        if (methodID && !$(event.currentTarget).hasClass("disabled")) {
            getJSON("checkout.updateOrderShippingMethod", { orderID: checkoutOrderID, shippingMethodID: methodID }, function (res) {
                if (res && res.result) {
                    doCheckout("payment");
                    $("#checkoutCreditAmount").val(parseFloat(res.result.storeCreditApplied).toFixed(2));
                    populateOrderDetails("#checkoutPaymentOrderInfoWrapper", res.result);
                    populateCheckoutGiftCards(res.result.giftCards);
                }
            })
        }
    })

    $(".details .categoryName").click(function (event) {
        var categoryName = event.target.innerText;
        loadSearch(categoryName, true);
    })

    $(".menuSearchWrapper").click(function (event) {
        if ($(event.target).is("#menuSearch")) return;

        if ($("#mainMenu").is(":visible")) {
            var menuSearchShowing = $("#menuSearch").is(":visible");
            mainMenuSearchToggle(!menuSearchShowing);
        } else {
            mainMenuShow();
        }
    });

    $("#advancedSearch").submit(function (event) {
        event.preventDefault();

        var searchParams = $(".searchParameters").children().toArray();
        var data = {};
        searchParams.forEach(function (elem) {
            var param = $(elem).data("parameter");
            if (param) {
                var paramName = param.name.toLowerCase();
                paramName = paramName.replace(/\s/g, "_");
                switch (param.type) {
                    case "text":
                        var val = $(elem).val();
                        if (val) {
                            data[paramName] = val;
                        }
                        break;
                    case "number":
                        var from = $(elem).find(".numFrom").val();
                        var to = $(elem).find(".numTo").val();
                        if (from != "" || to != "") {
                            data[paramName] = from + "," + to;
                        }
                        break;
                    case "multi":
                        var vals = $(elem).val();
                        if (vals.length > 0) {
                            var realVals = [];
                            for (val of vals) {
                                realVals.push(decodeURIComponent(val));
                            }
                            data[paramName] = realVals;
                        }
                        break;
                }
            } else {
                var productTypeID = $(elem).data("id");
                if (productTypeID) {
                    data.productTypeID = productTypeID;
                }
            }
        });

        scrollToContent();

        getJSON("advancedSearch", data, function (res) {
            if (res) {
                detachRenderCache();
                var newRenderCache = processSearchResults(res, undefined, undefined, "advancedSearch");
                processSearchResultFilters(newRenderCache);
                attachRenderCache(newRenderCache);

                // $("#filterCount").text(newRenderCache.resultCount);
                // $("#searchTotal").text(newRenderCache.resultCount);
                $("#searchFilter").val("");
            }
        })
    })
    $("#deckBuilder .variantSelAll").on("mousedown", function (event) {
        event.preventDefault();
    })
    $("#deckBuilder .variantSelAll").click(function (event) {
        var deckResult = $(event.target).closest(".deckResult");
        var allQuantity = deckResult.find("input.selectQuantity");
        allQuantity.toArray().forEach(function (quantity) {
            quantity = $(quantity);
            if (!quantity.hasClass("form-control")) quantity.val(0);
        })
        var targetQuantity = deckResult.data("targetQuantity");
        $(event.target).closest(".variant").find("input.selectQuantity").first().val(targetQuantity);
        console.log(targetQuantity);
        calculateDeckBuilderPrice();
    })
    $("#deckBuilder .removeCardBtn").click(function (event) {
        $(event.target).closest(".deckResult").remove();
        calculateDeckBuilderPrice();
    })
    $("#deckBuilder .variantAddToCart").on("mousedown", function (event) {
        event.preventDefault();
    })
    $("#deckBuilder .variantAddToCart").click(function (event) {
        var target = $(event.currentTarget);
        if (target.hasClass("disabled")) return;

        var variantInput = target.closest(".variant").find(".selectQuantity");
        var variantData = variantInput.data();
        var quantity = parseInt(variantInput.val());
        if (!isNaN(quantity)) {
            addToCart(defaultCartID, variantData.inventoryID, variantData.variantID, variantData.variantCombinationID, quantity, function (res) {
                popFade(res && res.success, target.outerWidth(), target.outerHeight(), target.offset().left, target.offset().top);
                if (res && res.success) {
                    incCartQty(quantity);
                }
            });
        }
    })

    $("#addressForm input, #addressForm select").on("input", function (event) {
        $("#checkoutAddress .checkoutSelectAddressBtn").addClass("disabled");
        $("#ccPaymentForm .submitCCBtn").addClass("disabled");
        $("#submitStripeBtn").addClass("disabled");

        $("#checkoutBuySelectAddressBtn").addClass("disabled");

        $("#submitNewAddress").removeClass("disabled");

    })
    addressDropdown = $('#accountAddressesBilling').selectize({
        valueField: 'id',
        labelField: 'fullName',
        searchField: ['name'],
        sortField: [
            { field: "id", direction: "desc" }
        ],
        maxItems: 1,
        //only using options-value in jsfiddle - real world it's using the load-function
        create: false,
        render: {
            option: function (item, escape) {
                var resHTML;
                if (item.id) {
                    resHTML = '<div class="addressDropdownWrapper">'
                        + '<div>' + item.firstName + " " + item.lastName + '</div> '
                        + '<div>' + item.address1 + '</div>'
                        + '<div>' + item.address2 + '</div>'
                        + '<div>' + item.city + ", " + item.state + '</div>'
                        + '<div>' + item.zipCode + '</div>'
                        + '<div>' + item.country + '</div>'
                        + '<div>' + item.phoneNumber + '</div>'
                        // + '<div>ID: ' + item.id + '</div> '
                        + '</div>';
                } else {
                    resHTML = '<div class="addressDropdownWrapper">'
                        + '<div>' + item.fullName + '</div> '
                        + '</div>';
                }
                return resHTML;
            }
        },
        onItemAdd: function (value, $item) {
            console.log(value);
            var selAddress = this.options[value];
            console.log(selAddress);
            selectedAddressID = selAddress.id;
            $("#deleteAddress").toggleClass("disabled", !selectedAddressID);
            $("#checkoutAddress .checkoutSelectAddressBtn").toggleClass("disabled", !selectedAddressID);
            $("#checkoutBuySelectAddressBtn").toggleClass("disabled", !selectedAddressID);
            $("#ccPaymentForm .submitCCBtn").toggleClass("disabled", !selectedAddressID);
            $("#submitStripeBtn").toggleClass("disabled", !selectedAddressID);
            $("#addNewAddressBtn").toggleClass("disabled", !selectedAddressID);

            $("#submitNewAddress").removeClass("disabled");

            $("#submitNewAddress").toggleClass("disabled", !!selectedAddressID);

            $("#addressForm input").css("border-color", "");
            $("#addressForm select").css("border-color", "");
            $("#addressForm .formError").hide();
            if (selAddress.id) {
                firstNameAddress.value = selAddress.firstName;
                lastNameAddress.value = selAddress.lastName;
                address1Address.value = selAddress.address1;
                address2Address.value = selAddress.address2;
                cityAddress.value = selAddress.city;
                $("#stateAddress").val(selAddress.state);
                if ($("#stateAddress").val() == null) {
                    $("#stateAddress").val("Other");
                    $("#stateAddressInput").val(selAddress.state);
                } else {
                    $("#stateAddressInput").val("");
                }
                $("#stateAddress").change();

                zipAddress.value = selAddress.zipCode;
                $("#countryAddress").val(selAddress.country).change();
                phoneAddress.value = selAddress.phoneNumber;
                $("#submitNewAddress .text").text("Update Address");
                $("#submitNewAddress .submitIcon").removeClass("fa-plus").addClass("fa-check");


            } else {
                firstNameAddress.value = "";
                lastNameAddress.value = "";
                address1Address.value = "";
                address2Address.value = "";
                cityAddress.value = "";
                $("#stateAddress").val("").change();
                $("#stateAddressInput").val("");
                zipAddress.value = "";
                $("#countryAddress").val("").change();
                phoneAddress.value = "";
                $("#submitNewAddress .text").text("Add New Address");
                $("#submitNewAddress .submitIcon").addClass("fa-plus").removeClass("fa-check");

            }
        }
    });
    addressDropdown[0].selectize.readonly = true;
    addressDropdown[0].selectize.$control.find("input").attr("readonly", "true")

    addressEditor = $("#addressForm");

    $("#stateAddress").change(function (event) {
        console.log(event);
        if ($("#stateAddress").val() == "Other") {
            $("#stateAddressInput").show();
        } else {
            $("#stateAddressInput").hide();
        }
    })

    $("#countryAddress").change(function (event) {
        var countrySelected = $("#countryAddress").val();
        $("#usaStates").toggle(countrySelected == "United States" || countrySelected == "");
        $("#canadaProvs").toggle(countrySelected == "Canada" || countrySelected == "");

        if (countrySelected != "United States" && countrySelected != "Canada" && countrySelected != "") $("#stateAddress").val("Other").change();

    })

    $(".accountTab").click(function (event) {
        var tabTarget = $(event.target).attr("target");
        doAccountDetails(tabTarget);
    })
    $("#cart .cartItem.hidden .updateDelete").click(function (event) {
        var cartData = $("#carts .active").data("cartData");
        var cartItemData = $(event.target).closest(".cartItem").data("cartItem");
        console.log(cartItemData);
        var newQuantity = parseInt($(event.target).closest(".cartItem").find(".quantity").val());

        var updateID = cartItemData.variantID;
        if (cartData.id == "buy") updateID = cartItemData.inventoryID;
        if (newQuantity == 0 || $(event.target).hasClass("fa-times")) {
            console.log("delete");
            var newQuantity = 0;
            if ($(event.target).closest("#wishlistItems").length) {
                newQuantity = cartItemData.inventoryQuantity;
            }
            $(event.target).closest(".cartItem").remove();
            updateCartItem(cartData.id, updateID, newQuantity);
        } else {
            $(event.target).removeClass("fa-check");
            $(event.target).addClass("fa-times");
            if ($(event.target).closest("#wishlistItems").length) {
                if (cartItemData.inventoryQuantity < cartItemData.quantity) newQuantity += cartItemData.inventoryQuantity;
            } else {
                if (cartItemData.inventoryQuantity < cartItemData.quantity) newQuantity += cartItemData.quantity - cartItemData.inventoryQuantity;
            }
            console.log("update: " + newQuantity);
            updateCartItem(cartData.id, updateID, newQuantity);
        }
        validateCartContent(false, cartData.id == "buy");
    })

    $("#cart .cartItem.hidden .quantity").on("change", function (event) {
        $(event.target).closest(".cartItem").find(".updateDelete").removeClass("fa-times");
        $(event.target).closest(".cartItem").find(".updateDelete").addClass("fa-check");
    })

    $("#cart .cartItem.hidden .name").click(function (event) {
        console.log(event);
        if (!event.shiftKey) {
            event.preventDefault();
            var cartItem = $(event.target).closest(".cartItem").data("cartItem");
            console.log(cartItem);
            viewItemDetails(cartItem.inventoryID, cartItem.categoryName, cartItem.name);
        }
    })
    $("#carts > li.hidden").click(function (event) {
        var cartData = $(event.target).data("cartData");
        console.log(cartData);
        populateCart(cartData);

    })
    $("#cart").on("click", ".cartItemBundle a", function (event) {
        console.log(event);
        if (!event.shiftKey) {
            event.preventDefault();
            var bundleData = $(event.target).closest(".cartItemBundle").data();
            console.log(bundleData);
            viewBundleDetails(bundleData.bundleID, bundleData.categoryName, bundleData.bundleName);
        }
    })
    $("#cart").on("click", ".cartItemBundle .bundleDelete", function (event) {
        var bundleData = $(event.target).closest(".cartItemBundle").data();
        console.log(bundleData);
        $(event.target).closest(".cartItemBundle").remove();
        incCartQty(-1, false);
        getJSON("deleteCartBundle", { cartBundleID: bundleData.cartBundleID }, function (res) {
            var cartItems;
            if (res && res.result && res.result.cartItems) cartItems = res.result.cartItems;
            populateCartContent(cartItems);
        })
    })

    $(".logoutBtn").click(logoutUser);
    $(".fadeOverlay").click(function () {
        highlightOverlayRemove();
    });
    $("#addNewAddressBtn").click(function (event) {
        addressDropdown[0].selectize.addItem(0);
    })
    $("#deleteAddress").click(function (event) {
        $("#deleteAddress").addClass("disabled");
        if (selectedAddressID) {
            $("#deleteAddress .submitIcon").removeClass("fa-trash").addClass("fa-spinner fa-pulse");


            getJSON("deleteAddress", { addressID: selectedAddressID }, function (res) {
                $("#deleteAddress .submitIcon").addClass("fa-trash").removeClass("fa-spinner fa-pulse");
                getAddresses();
            });
        }
    });
    $("#applyStoreCreditPayment").submit(function (event) {
        event.preventDefault();

        var creditToApply = parseFloat($("#checkoutCreditAmount").val());
        var totalOutstanding = checkoutOrderTotal - checkoutGiftCardApplied;

        if (creditToApply > totalOutstanding) creditToApply = totalOutstanding;
        if (creditToApply > checkoutCreditMax) creditToApply = checkoutCreditMax;
        creditToApply = parseFloat(creditToApply.toFixed(2));

        $("#applyStoreCreditPayment #checkoutCreditAmount").val(creditToApply).blur();
        getJSON("checkout.applyStoreCredit", { orderID: checkoutOrderID, amount: creditToApply }, function (res) {
            if (res && res.result) {
                populateOrderDetails("#checkoutPaymentSummaryTable", res.result);
                $("#checkoutCreditAmount").val(parseFloat(res.result.storeCreditApplied).toFixed(2));
            }
        })
    })

    $("#checkoutPaymentAddGiftCardBtn").on("click", function (event) {
        $("#checkoutPaymentGiftCardCode").val("");
        $("#checkoutPaymentGiftCardPIN").val("");

        $("#checkoutPaymentAddGiftCardWrapper").toggleClass("open");
        $("#checkoutPaymentGiftCardCode").focus();
    })
    var populateCheckoutGiftCards = function (giftCards) {
        var checkoutPaymentGiftCards = $("#checkoutPaymentGiftCards");
        checkoutPaymentGiftCards.empty();
        if (giftCards) {
            for (giftCard of giftCards) {
                var newGiftCard = $(`
                <div class="checkoutPaymentGiftCardCodeWrapper">
                    <span class="checkoutPaymentGiftCardCode">${formatGiftCardCode(giftCard.code)}</span>
                    <div>
                        <div>Balance</div>
                        <div>Applied</div>
                    </div>
                    <div>
                        <div class="checkoutPaymentGiftCardBalance">${round(giftCard.balance, 2, true, true, true)}</div>
                        <div class="checkoutPaymentGiftCardAmount">${round(giftCard.amount, 2, true, true, true)}</div>
                    </div>
                    <span class="checkoutPaymentGiftCardRemoveBtn">
                    <i class="fas fa-window-close"></i></span>
                </div>`);
                newGiftCard.data("giftCardCode", giftCard.code);
                newGiftCard.appendTo(checkoutPaymentGiftCards);
            }
        }
    }
    $("#checkoutPaymentApplyGiftCard").submit(function (event) {
        event.preventDefault();

        var giftCardCode = $("#checkoutPaymentGiftCardCode").cleanVal().toUpperCase();
        var giftCardPIN = $("#checkoutPaymentGiftCardPIN").cleanVal();

        if (isValidGiftCardCode(giftCardCode)) {
            var currentGiftCardCodes = $("#checkoutPaymentGiftCards .checkoutPaymentGiftCardCodeWrapper").toArray().map(v => $(v).data("giftCardCode"));
            if (!currentGiftCardCodes.includes(giftCardCode)) {
                getJSON("checkout.getGiftCardBalance", { code: giftCardCode, pin: giftCardPIN }, function (res) {
                    if (res && res.success) {
                        var giftCardToApply = res.result.giftCardBalance;
                        if (giftCardToApply > 0) {

                            var orderOutstanding = checkoutOrderTotal - checkoutCreditApplied - checkoutGiftCardApplied;
                            if (giftCardToApply > orderOutstanding) giftCardToApply = orderOutstanding;
                            giftCardToApply = parseFloat(giftCardToApply.toFixed(2));

                            getJSON("checkout.applyGiftCard", { orderID: checkoutOrderID, code: giftCardCode, pin: giftCardPIN, amount: giftCardToApply }, function (res2) {
                                if (res2 && res2.success) {
                                    populateOrderDetails("#checkoutPaymentSummaryTable", res2.result);
                                    populateCheckoutGiftCards(res2.result.giftCards);
                                    $("#checkoutPaymentAddGiftCardWrapper").removeClass("open");
                                }
                            })
                        } else {
                            messageBox("The giftcard entered has a balance of $0 remaining.<br>Please use another card.");
                        }
                    } else {
                        messageBox("Either the giftcard code or PIN was incorrect.<br>Please verify these and try again.");
                    }
                })
            } else {
                messageBox("This gift card is already applied to this order.<br>You must remove it before you can apply it again.");
            }
        } else {
            messageBox("This giftcard code appears to be invalid.<br>Please check the code and try again.");
        }
    })
    $("#checkoutPaymentGiftCards").on("click", ".checkoutPaymentGiftCardRemoveBtn", function (event) {
        var giftCardCode = $(event.target).closest(".checkoutPaymentGiftCardCodeWrapper").data("giftCardCode");
        getJSON("checkout.applyGiftCard", { orderID: checkoutOrderID, code: giftCardCode, amount: 0 }, function (res) {
            if (res && res.success) {
                populateOrderDetails("#checkoutPaymentSummaryTable", res.result);
                populateCheckoutGiftCards(res.result.giftCards);

            }
        })
    })
    $("#submitCreditOnlyBtn").click(function (event) {
        getJSON("checkout.makePayment", { paymentType: "none", orderID: checkoutOrderID, email: userLoggedIn ? undefined : noLoginEmail, userFields: getCheckoutUserFields(), customerComment: getCheckoutCustomerComment() }, function (res) {
            if (res && res.result && res.success) {
                populateOrderDetails("#checkoutPaymentCompleteTable", res.result);
                doCheckout("complete");
                gTagPurchase(res.result);
            } else {
                handleMakePaymentError(res.errors, res.result);
            }
        })
    })
    $("#submitPayLaterBtn").click(function (event) {
        getJSON("checkout.makePayment", { paymentType: "payLater", orderID: checkoutOrderID, userFields: getCheckoutUserFields(), customerComment: getCheckoutCustomerComment() }, function (res) {
            if (res && res.result && res.success) {
                populateOrderDetails("#checkoutPaymentCompleteTable", res.result);
                doCheckout("complete");
                gTagPurchase(res.result);
            } else {
                handleMakePaymentError(res.errors, res.result);
            }
        })
    })
    $("#ccPaymentForm").submit(function (event) {
        if ($("#ccPaymentForm .submitCCBtn").hasClass("disabled")) return;

        console.log("submit cc");
        console.log($("#checkout #ccNumber").cleanVal());
        event.preventDefault();

        var ccNumVal = $("#checkout #ccNumber").cleanVal();
        var ccExpiryVal = $("#checkout #ccExpiry").cleanVal();
        var ccCVVVal = $("#checkout #ccCVV").val();

        var sameAsShipping = $("#checkoutPaymentAddressSame").prop("checked");
        var billingAddressID = sameAsShipping ? checkoutShippingAddressID : selectedAddressID;

        if (billingAddressID) {
            $("#ccPaymentForm .submitCCBtn").addClass("disabled");
            $("#ccPaymentForm .submitCCBtn span").show();
            getJSON("checkout.makePayment", { paymentType: "creditCard", orderID: checkoutOrderID, email: userLoggedIn ? undefined : noLoginEmail, paymentDetails: { billingAddressID: billingAddressID, cardNumber: ccNumVal, expirationDate: ccExpiryVal, cardCode: ccCVVVal }, userFields: getCheckoutUserFields(), customerComment: getCheckoutCustomerComment() }, function (res) {
                $("#ccPaymentForm .submitCCBtn").removeClass("disabled");
                $("#ccPaymentForm .submitCCBtn span").hide();

                if (res && res.result && res.success) {
                    populateOrderDetails("#checkoutPaymentCompleteTable", res.result);
                    doCheckout("complete");
                    gTagPurchase(res.result);
                } else {
                    handleMakePaymentError(res.errors, res.result);
                }
            })
        }
    })
    $("#addressForm").submit(function (event) {
        if (!$("#submitNewAddress").hasClass("disabled")) {
            console.log("MAKE NEW ADDRESS");
            event.preventDefault();
            var hasError = false;
            if (firstNameAddress.validity.valid) {
                $(firstNameAddress).css("border-color", "");
                $(firstNameAddress).closest("label").find(".formError").slideUp();
            } else {
                if (!hasError) $(firstNameAddress).focus();
                $(firstNameAddress).css("border-color", "red");
                $(firstNameAddress).closest("label").find(".formError").slideDown();
                hasError = true;
            }
            if (lastNameAddress.validity.valid) {
                $(lastNameAddress).css("border-color", "");
                $(lastNameAddress).closest("label").find(".formError").slideUp();
            } else {
                if (!hasError) $(lastNameAddress).focus();
                $(lastNameAddress).css("border-color", "red");
                $(lastNameAddress).closest("label").find(".formError").slideDown();
                hasError = true;
            }
            if (address1Address.validity.valid) {
                $(address1Address).css("border-color", "");
                $(address1Address).closest("label").find(".formError").slideUp();
            } else {
                if (!hasError) $(address1Address).focus();
                $(address1Address).css("border-color", "red");
                $(address1Address).closest("label").find(".formError").slideDown();
                hasError = true;
            }
            if (cityAddress.validity.valid) {
                $(cityAddress).css("border-color", "");
                $(cityAddress).closest("label").find(".formError").slideUp();
            } else {
                if (!hasError) $(cityAddress).focus();
                $(cityAddress).css("border-color", "red");
                $(cityAddress).closest("label").find(".formError").slideDown();
                hasError = true;
            }

            var stateValid = false;
            if (stateAddress.validity.valid) {
                if ($("#stateAddressInput").is(":visible")) {
                    if (stateAddressInput.validity.valid) stateValid = true;
                } else {
                    stateValid = true;
                }
            }
            if (stateValid) {
                $(stateAddress).css("border-color", "");
                $(stateAddressInput).css("border-color", "");
                $(stateAddress).closest("label").find(".formError").slideUp();
            } else {
                if (!hasError) {
                    if ($("#stateAddressInput").is(":visible")) {
                        $("#stateAddressInput").focus();
                    } else {
                        $(stateAddress).focus();
                    }
                }
                $(stateAddress).css("border-color", "red");
                $(stateAddressInput).css("border-color", "red");
                $(stateAddress).closest("label").find(".formError").slideDown();
                hasError = true;
            }
            if (zipAddress.validity.valid) {
                $(zipAddress).css("border-color", "");
                $(zipAddress).closest("label").find(".formError").slideUp();
            } else {
                if (!hasError) $(zipAddress).focus();
                $(zipAddress).css("border-color", "red");
                $(zipAddress).closest("label").find(".formError").slideDown();
                hasError = true;
            }
            if (countryAddress.validity.valid) {
                $(countryAddress).css("border-color", "");
                $(countryAddress).closest("label").find(".formError").slideUp();
            } else {
                if (!hasError) $(countryAddress).focus();
                $(countryAddress).css("border-color", "red");
                $(countryAddress).closest("label").find(".formError").slideDown();
                hasError = true;
            }
            if (phoneAddress.validity.valid) {
                $(phoneAddress).css("border-color", "");
                $(phoneAddress).closest("label").find(".formError").slideUp();
            } else {
                if (!hasError) $(phoneAddress).focus();
                $(phoneAddress).css("border-color", "red");
                $(phoneAddress).closest("label").find(".formError").slideDown();
                hasError = true;
            }
            if (hasError) {
                // $("#addressForm").effect("shake");
            } else {
                var stateValue = $("#stateAddress").val();
                if (stateValue == "Other") stateValue = $("#stateAddressInput").val();
                createAddress(selectedAddressID, firstNameAddress.value, lastNameAddress.value, address1Address.value, address2Address.value, cityAddress.value, stateValue, zipAddress.value, countryAddress.value, phoneAddress.value)
            }
        }
    })
    $("#loginForm").submit(function (event) {
        console.log("LOGIN");
        event.preventDefault();
        var hasError = false;
        if (email.validity.valid) {
            $(email).css("border-color", "");
            $(email).closest("label").find(".formError:eq(0)").slideUp();
        } else {
            if (!hasError) $(email).focus();
            $(email).css("border-color", "red");
            $(email).closest("label").find(".formError:eq(0)").slideDown();
            hasError = true;
        }
        if (password.validity.valid) {
            $(password).css("border-color", "");
            $(password).closest("label").find(".formError:eq(0)").slideUp();
        } else {
            if (!hasError) $(password).focus();
            $(password).css("border-color", "red");
            $(password).closest("label").find(".formError:eq(0)").slideDown();
            hasError = true;
        }
        if (hasError) {
            $(".registerBox").effect("shake");
        } else {

            loginUser(email.value, password.value);
        }
    });
    $("#checkoutNoLoginForm").submit(function (event) {
        event.preventDefault();
        noLoginEmail = $("#checkoutNoLoginEmail").val().toLowerCase();

        $("#checkoutNoLoginForm .submitIcon").removeClass("fa-lock").addClass("fa-spinner fa-pulse").closest("button").prop("disabled", true);
        getJSON("checkout.updateOrderEmail", { email: noLoginEmail, orderID: checkoutOrderID }, function (res) {
            $("#checkoutNoLoginForm .submitIcon").removeClass("fa-spinner fa-pulse").addClass("fa-lock").closest("button").prop("disabled", false);
            if (res && res.success) {
                var itemsMissing;
                var itemsRemoved;
                var error36 = res.errors.find(v => v.code == 36);
                if (error36) {
                    itemsMissing = error36.itemsMissing;
                    itemsRemoved = error36.itemsRemoved;
                }
                populateOrderSummary(res.result.orderID, res.result.items, res.result.preorderDate, itemsMissing, itemsRemoved, res.result.coupons);
                doCheckout("summary");
            }
        })

    })
    $("#checkoutLoginForm").submit(function (event) {
        console.log("LOGIN");
        event.preventDefault();
        var hasError = false;
        if (checkoutLoginEmail.validity.valid) {
            $(checkoutLoginEmail).css("border-color", "");
            $(checkoutLoginEmail).closest("label").find(".formError:eq(0)").slideUp();
        } else {
            if (!hasError) $(checkoutLoginEmail).focus();
            $(checkoutLoginEmail).css("border-color", "red");
            $(checkoutLoginEmail).closest("label").find(".formError:eq(0)").slideDown();
            hasError = true;
        }
        if (checkoutLoginPassword.validity.valid) {
            $(checkoutLoginPassword).css("border-color", "");
            $(checkoutLoginPassword).closest("label").find(".formError:eq(0)").slideUp();
        } else {
            if (!hasError) $(checkoutLoginPassword).focus();
            $(checkoutLoginPassword).css("border-color", "red");
            $(checkoutLoginPassword).closest("label").find(".formError:eq(0)").slideDown();
            hasError = true;
        }
        if (hasError) {
            $("#checkoutLoginForm").effect("shake");
        } else {

            loginUser(checkoutLoginEmail.value, checkoutLoginPassword.value, true);
        }
    });

    $("#addCartForm").submit(function (event) {
        console.log("LOGIN");
        event.preventDefault();
        var hasError = false;
        if (newCartName.validity.valid) {
            $(newCartName).css("border-color", "");
            $(newCartName).closest("label").find(".formError:eq(0)").slideUp();
        } else {
            if (!hasError) $(newCartName).focus();
            $(newCartName).css("border-color", "red");
            $(newCartName).closest("label").find(".formError:eq(0)").slideDown();
            hasError = true;
        }
        if (hasError) {
            $(".addCartBox").effect("shake");
        } else {
            var newCartNameS = newCartName.value;
            console.log("addCart: " + newCartNameS);
            $(".addCartBox .submitIcon").removeClass("fa-plus").addClass("fa-spinner fa-pulse");

            getJSON("addCart", { name: newCartNameS }, function (res) {
                $(".addCartBox .submitIcon").addClass("fa-plus").removeClass("fa-spinner fa-pulse");
                if (res) {
                    if (res.success === true) {
                        var oldCartID = $("#carts .active").data("cartData").id;
                        getCarts(true, oldCartID);
                        highlightOverlayRemove();
                    } else {
                        $(".addCartBox").effect("shake");
                        var errorCodes = res.errors.map(error => error.code);
                        if (errorCodes.includes(11)) {
                            $(newCartName).css("border-color", "red");
                            $(newCartName).closest("label").find(".formError:eq(1)").slideDown();

                        }
                    }
                }
            });
        }
    });
    $("#renameCartForm").submit(function (event) {
        console.log("CART RENAME");
        event.preventDefault();
        var hasError = false;
        if (renameCartName.validity.valid) {
            $(renameCartName).css("border-color", "");
            $(renameCartName).closest("label").find(".formError:eq(0)").slideUp();
        } else {
            if (!hasError) $(renameCartName).focus();
            $(renameCartName).css("border-color", "red");
            $(renameCartName).closest("label").find(".formError:eq(0)").slideDown();
            hasError = true;
        }
        if (hasError) {
            $(".renameCartBox").effect("shake");
        } else {
            var newCartNameS = renameCartName.value;
            console.log("renameCart: " + newCartNameS);
            $(".renameCartBox .submitIcon").removeClass("fa-edit").addClass("fa-spinner fa-pulse");
            var cartID = $("#carts .active").data("cartData").id;


            getJSON("renameCart", { cartID: cartID, name: newCartNameS }, function (res) {
                $(".renameCartBox .submitIcon").addClass("fa-edit").removeClass("fa-spinner fa-pulse");
                if (res) {


                    if (res.success === true) {
                        getCarts(true, cartID);
                        highlightOverlayRemove();
                    } else {
                        $(".addCartBox").effect("shake");
                        var errorCodes = res.errors.map(error => error.code);
                        if (errorCodes.includes(11)) {
                            $(renameCartName).css("border-color", "red");
                            $(renameCartName).closest("label").find(".formError:eq(1)").slideDown();

                        }
                    }
                }
            });
        }
    });
    $("#registerForm").submit(function (event) {
        console.log("REGISTER");
        event.preventDefault();
        var hasError = false;
        if (emailReg.validity.valid) {
            $(emailReg).css("border-color", "");
            $(emailReg).closest("label").find(".formError:eq(0)").slideUp();
        } else {
            if (!hasError) $(emailReg).focus();
            $(emailReg).css("border-color", "red");
            $(emailReg).closest("label").find(".formError:eq(0)").slideDown();
            hasError = true;
        }
        if (passwordReg.validity.valid) {
            $(passwordReg).css("border-color", "");
            $(passwordReg).closest("label").find(".formError").slideUp();
        } else {
            if (!hasError) $(passwordReg).focus();
            $(passwordReg).css("border-color", "red");
            $(passwordReg).closest("label").find(".formError").slideDown();
            hasError = true;
        }
        if (passwordConfirmReg.validity.valid && passwordReg.value == passwordConfirmReg.value) {
            $(passwordConfirmReg).css("border-color", "");
            $(passwordConfirmReg).closest("label").find(".formError").slideUp();
        } else {
            if (!hasError) $(passwordConfirmReg).focus();
            $(passwordConfirmReg).css("border-color", "red");
            $(passwordConfirmReg).closest("label").find(".formError").slideDown();
            hasError = true;
        }
        if (firstNameReg.validity.valid) {
            $(firstNameReg).css("border-color", "");
            $(firstNameReg).closest("label").find(".formError").slideUp();
        } else {
            if (!hasError) $(firstNameReg).focus();
            $(firstNameReg).css("border-color", "red");
            $(firstNameReg).closest("label").find(".formError").slideDown();
            hasError = true;
        }
        if (lastNameReg.validity.valid) {
            $(lastNameReg).css("border-color", "");
            $(lastNameReg).closest("label").find(".formError").slideUp();
        } else {
            if (!hasError) $(lastNameReg).focus();
            $(lastNameReg).css("border-color", "red");
            $(lastNameReg).closest("label").find(".formError").slideDown();
            hasError = true;
        }

        if (hasError) {
            $(".registerBox").effect("shake");
        } else {
            var userPool = new AmazonCognitoIdentity.CognitoUserPool({
                UserPoolId: userPoolID,
                ClientId: appClientID
            });

            var attributeList = [];

            var username = emailReg.value.toLowerCase();
            var password = passwordReg.value;
            var firstName = firstNameReg.value.trim();
            var lastName = lastNameReg.value.trim();

            var dataEmail = {
                Name: 'email',
                Value: username
            };
            var dataFamilyName = {
                Name: 'family_name',
                Value: lastName
            };
            var dataGivenName = {
                Name: "given_name",
                Value: firstName
            }
            var attributeEmail = new AmazonCognitoIdentity.CognitoUserAttribute(dataEmail);
            var attributeFamilyName = new AmazonCognitoIdentity.CognitoUserAttribute(dataFamilyName);
            var attributeGivenName = new AmazonCognitoIdentity.CognitoUserAttribute(dataGivenName);

            attributeList.push(attributeEmail);
            attributeList.push(attributeFamilyName);
            attributeList.push(attributeGivenName);

            var validationList = [];
            var valFirstName = {
                Name: 'firstName',
                Value: firstName
            };
            var valLastName = {
                Name: "lastName",
                Value: lastName
            };
            validationList.push(new AmazonCognitoIdentity.CognitoUserAttribute(valFirstName));
            validationList.push(new AmazonCognitoIdentity.CognitoUserAttribute(valLastName));

            $(".registerBox .submitIcon").removeClass("fa-lock").addClass("fa-spinner fa-pulse");

            userPool.signUp(username, password, attributeList, validationList, function (err, result) {
                $(".registerBox .submitIcon").addClass("fa-lock").removeClass("fa-spinner fa-pulse");
                if (err) {
                    $(".registerBox").effect("shake");
                    if (err.code === "UsernameExistsException") {
                        $(emailReg).closest("label").find(".formError:eq(1)").slideDown();
                    }
                    console.log(err);
                    return;
                }
                cognitoUser = result.user;
                console.log('user name is ' + cognitoUser.getUsername());
                highlightOverlayRemove();
                gtagSignUp();
                loginUser(username, password);
            });
        }
    });
    $(".myAccountBtn").click(function () {
        doAccountDetails("user");
    });
    $("#updateAccountDetailsForm").submit(function (event) {
        event.preventDefault();
        updateAccountDetails();
    });
    $(".addCartBtn").click(function () {
        if (!userLoggedIn) {
            messageBox("You must be logged in to add secondary carts.");
            return;
        }
        console.log("add cart btn");
        $(".addCartBox").css("top", $(".addCartBtn").offset().top - $(window).scrollTop());
        $(".addCartBox").css("left", $(".addCartBtn").offset().left - $(window).scrollLeft());
        $(newCartName).css("border-color", "");
        $(newCartName).closest("label").find(".formError").hide();
        highlightOverlay([".addCartBox"]);
        newCartName.value = "";
        $("#newCartName").focus();

    });
    $(".editCartNameBtn").click(function () {
        console.log("edit cart btn");
        var cartName = $("#carts .active").data("cartData").name;
        $(".renameCartBox").css("top", $(".cart.header").position().top - $(window).scrollTop());
        $(".renameCartBox").css("left", $(".cart.header").position().left - $(window).scrollLeft());
        $("#renameCartName")[0].value = cartName;

        $(renameCartName).css("border-color", "");
        $(renameCartName).closest("label").find(".formError").hide();

        highlightOverlay([".renameCartBox"]);
        $("#renameCartName").select()

    });

    $("#noDeleteCart").click(function () {
        highlightOverlayRemove();
    })
    $(".deleteCartBtn").click(function (event) {
        event.stopPropagation();
        var cartData = $(event.target).closest("li").data("cartData");
        console.log(cartData);

        $(".deleteCartBox .cartName")[0].innerText = cartData.name;
        $(".deleteCartBox .cartCount")[0].innerText = cartData.quantity;
        $(".deleteCartBox").data("cartID", cartData.id);
        $(".deleteCartBox").css("top", $(event.target).position().top - $(window).scrollTop());

        console.log("delete cart btn");
        highlightOverlay([".deleteCartBox"]);

    })
    $("#yesDeleteCart").click(function () {
        $("#yesDeleteCart .submitIcon").removeClass("fa-check ").addClass("fa-spinner fa-pulse");
        var cartID = $(".deleteCartBox").data("cartID");
        console.log("delete cart: " + cartID);
        getJSON("deleteCart", { cartID: cartID }, function (res) {
            $("#yesDeleteCart .submitIcon").addClass("fa-check ").removeClass("fa-spinner fa-pulse");
            if (res) {
                getCarts(true, 0);
                highlightOverlayRemove();
            }
        });

    })
    $(".beginCheckoutBtn").click(function (event) {
        if ($(".beginCheckoutBtn").hasClass("disabled")) return;

        $("#submitBuyOrderBtn").attr("disabled", false);

        var lastItems = $("#cart").data("cartItems");
        var cartData = $("#cart").data("cartData");
        console.log(lastItems);
        console.log(cartData);

        if (cartData.id == "buy") {
            createBuyOrderMode = "all";
            if (customizations.buyOrderPaymentMethodModes) {
                createBuyOrderMode = "regular";
                if ($(event.currentTarget).is("#beginCheckoutBtnCPM")) createBuyOrderMode = "cpm";
            }
            getJSON("getBuyCart", {}, function (res) {
                if (res && res.success) {
                    var cartOrder = {
                        items: [],
                        payments: [],
                        status: "new"
                    };
                    for (cartItem of res.result.buyCartItems) {
                        if (createBuyOrderMode == "all" || (createBuyOrderMode == "cpm" && cartItem.buyCPM) || (createBuyOrderMode == "regular" && !cartItem.buyCPM)) {
                            var newItem = {
                                inventoryName: cartItem.name,
                                categoryName: cartItem.categoryName,
                                newPrice: cartItem.buyPrice,
                                newQuantity: cartItem.quantity,
                                isBulk: cartItem.isBulk,
                                buyCPM: cartItem.buyCPM
                            }
                            cartOrder.items.push(newItem);
                        }
                    }
                    cartOrder.newTotal = cartOrder.items.reduce((a, b) => {
                        var nextPriceSum = b.newPrice * b.newQuantity
                        if (b.buyCPM) nextPriceSum = nextPriceSum / 1000;
                        return a + nextPriceSum
                    }, 0);
                    populateBuyOrderDetails($("#checkoutBuyOrderSummaryItems"), cartOrder, false);
                    doCheckoutBuy("summary");
                }
            })
        } else {
            console.log("beginCheckoutBtn:");
            $(".beginCheckoutBtn").addClass("disabled");

            $("#checkoutCustomerCommentEnable").prop("checked", false).change();
            $("#checkoutCustomerComment").val("");

            var incompleteCartBundleIDs = [];
            var cartBundles = $("#cart .cartItemBundle").toArray();
            for (cartBundle of cartBundles) {
                cartBundle = $(cartBundle);
                var cartBundleData = cartBundle.data();
                if (cartBundleData.isOutOfStock) incompleteCartBundleIDs.push(cartBundleData.cartBundleID);
            }
            getJSON("checkout.createOrder", { cartID: cartData.id, incompleteCartBundleIDs: incompleteCartBundleIDs }, function (res) {
                if (res && res.success) {
                    checkoutOrderID = res.result.orderID;

                    $("#checkoutSummaryRemovedWarningItems").empty();
                    $("#checkoutSummaryMissingWarningItems").empty();
                    gtagBeginCheckout(res.result.items);
                    populateOrderSummary(res.result.orderID, res.result.items, res.result.preorderDate, res.result.itemsMissing, res.result.itemsRemoved, res.result.coupons);

                    clearInterval(checkoutTimer);
                    $("#checkoutTimer").text("10:00");
                    var endTime = Date.now() + 600000;//10000//600000;
                    checkoutTimer = setInterval(function () {
                        var totalSeconds = Math.round((endTime - Date.now()) / 1000);
                        var minutes = Math.trunc(totalSeconds / 60);
                        var seconds = totalSeconds % 60;
                        if (String(seconds).length < 2) seconds = "0" + seconds;
                        var timerText = minutes + ":" + seconds;
                        if (seconds < 0) {
                            if ((!$("#ccPaymentForm .submitCCBtn").hasClass("disabled")) || (!$("#submitStripeBtn").hasClass("disabled"))) {
                                clearInterval(checkoutTimer);
                                if ($(".checkout.right").is(":visible")) {
                                    doCart();
                                    messageBox("Checkout has expired.  You have been returned to your cart.  You must complete your checkout within 10 minutes.");
                                }
                            }
                        } else {
                            $("#checkoutTimer").text(timerText);

                        }

                    }, 1000);

                    var requiredFieldItems = res.result.items.filter(v => v.requiredUserFields);
                    var checkoutInformationRequiredFieldItems = $("#checkoutInformationRequiredFieldItems");
                    checkoutInformationRequiredFieldItems.empty();

                    var usedFieldIDs = [];
                    if (requiredFieldItems.length > 0) {
                        $("#checkoutProgressInformationRequiredTab").show();
                        for (nextRequiredItem of requiredFieldItems) {
                            var nextQuantityText = "";
                            if (nextRequiredItem.quantity > 1) nextQuantityText = `${nextRequiredItem.quantity}x `;
                            var newItemRequiresFields = $(`
                                <div class="requiredFieldsItem">
                                    <div class="itemRequiredFieldsName">${nextQuantityText}${nextRequiredItem.name}</div>
                                    <div class="itemRequiredFields"></div>
                                </div>
                            `);
                            newItemRequiresFields.data(nextRequiredItem);

                            var itemRequiredFields = newItemRequiresFields.find(".itemRequiredFields");
                            for (var i = 0; i < nextRequiredItem.quantity; i++) {
                                for (nextRequiredField of nextRequiredItem.requiredUserFields) {
                                    var placeholderText = "";
                                    if (nextRequiredField.ui == undefined) {
                                        nextRequiredField.ui = {}
                                        if (nextRequiredField.uiJSON) nextRequiredField.ui = JSON.parse(nextRequiredField.uiJSON);
                                    }
                                    if (nextRequiredField.ui.placeholder) placeholderText = nextRequiredField.ui.placeholder;

                                    var userFieldNameRegistration = "";
                                    if (nextRequiredField.ui.registerLink) userFieldNameRegistration = `<div class="userFieldNameRegistration">Need to sign up? Register <a href="${nextRequiredField.ui.registerLink}" target="_blank">here</a>.</div>`;

                                    var saveFieldLabel = "";
                                    if (!usedFieldIDs.includes(nextRequiredField.userFieldID)) {
                                        saveFieldLabel = `<label class="saveFieldLabel"><input type="checkbox" checked> Save to Account</label>`;
                                        usedFieldIDs.push(nextRequiredField.userFieldID);
                                    }
                                    var newUserField = $(`
                                    <label class="itemRequiredField">
                                        <div class="userFieldName">${nextRequiredField.userFieldName}</div>
                                        ${userFieldNameRegistration}
                                        <input class="userFieldTextInput" type="text" placeholder="${placeholderText}" userFieldID="${nextRequiredField.userFieldID}" required pattern=".*\\S.*">
                                        ${saveFieldLabel}
                                    </label>
                                    `);

                                    newUserField.appendTo(itemRequiredFields);
                                }
                            }
                            newItemRequiresFields.appendTo(checkoutInformationRequiredFieldItems);
                        }

                    } else {
                        $("#checkoutProgressInformationRequiredTab").hide();
                    }

                    $("#checkoutProgress ol li").removeClass("top");
                    if (userLoggedIn) {
                        $("#checkoutProgressSummaryTab").addClass("top");
                        $("#checkoutProgressAccountTab").hide();
                        doCheckout("summary");
                    } else {
                        $("#checkoutProgressAccountTab").show().addClass("top");
                        doCheckout("accountLogin");
                    }

                } else {
                    $(".beginCheckoutBtn").removeClass("disabled");

                    if (res && res.errors && res.errors.length && res.errors.find(v => v.code == 12)) {
                        messageBox("Cart is empty or contains no items of value.");
                    }
                    if (res && res.errors && res.errors.length && res.errors.find(v => v.code == 10)) {
                        messageBox("Cart does not exist.  You may need to login or refresh the cart to proceed.");
                    }
                }
            });
        }
    })
    $("#addCouponToCartBtn").click(function (event) {
        messageBox("Enter Coupon Code", {
            showInput: true, inputType: "text", onSubmit: function (inputValue, closeMessageBox) {
                inputValue = inputValue.toUpperCase();
                var cartData = $("#cart").data("cartData");
                getJSON("addCouponCodeToCart", { cartID: cartData.id, couponCode: inputValue }, function (res) {
                    if (res && res.success && res.result) {
                        populateCartContent(res.result);
                        closeMessageBox();
                    } else {
                        messageBox("Invalid Coupon Code");
                    }
                })
            }
        })
    })
    $("#cart .cartCoupon.hidden .cartCouponDeleteBtn").click(function (event) {
        console.log(event);
        var cartCoupon = $(event.currentTarget).closest(".cartCoupon").data("cartCoupon");
        var cartData = $("#cart").data("cartData");

        getJSON("removeCouponCodeFromCart", { cartID: cartData.id, couponCode: cartCoupon.couponCode }, function (res) {
            if (res && res.success && res.result) {
                populateCartContent(res.result);
            }
        })
    })
    $(".loginBtn").click(function () {
        $("#email")[0].value = "";
        $("#password")[0].value = "";

        $(email).css("border-color", "");
        $(email).closest("label").find(".formError").hide();
        $(password).css("border-color", "");
        $(password).closest("label").find(".formError").hide();


        highlightOverlay([".loginBox"]);
        $("#email").focus();
    });
    $(".registerBtn").click(function () {
        $("#emailReg")[0].value = "";
        $("#passwordReg")[0].value = "";
        $("#passwordConfirmReg")[0].value = "";
        $("#firstNameReg")[0].value = "";
        $("#lastNameReg")[0].value = "";

        $(emailReg).css("border-color", "");
        $(emailReg).closest("label").find(".formError").hide();
        $(passwordReg).css("border-color", "");
        $(passwordReg).closest("label").find(".formError").hide();
        $(passwordConfirmReg).css("border-color", "");
        $(passwordConfirmReg).closest("label").find(".formError").hide();
        $(firstNameReg).css("border-color", "");
        $(firstNameReg).closest("label").find(".formError").hide();
        $(lastNameReg).css("border-color", "");
        $(lastNameReg).closest("label").find(".formError").hide();
        $(email).css("border-color", "");
        $(email).closest("label").find(".formError").hide();


        highlightOverlay([".registerBox"]);
        $("#emailReg").focus();
    });
    $(".quickAddBtn").click(addVariantToCart);
    $(".btnAddCart").click(function (event) {
        if ($(event.target).closest(".variant").is(".buyList")) {
            if (userLoggedIn) {
                messageBox("How many to add to cart?", {
                    showInput: true,
                    inputDefaultVal: parseInt($(event.target).closest(".variant").find(".quantity").val()),
                    inputType: "number",
                    onSubmit: function (value, closeFunc) {
                        closeFunc();
                        event.buyQty = parseInt(value);
                        addVariantToCart(event);
                    }
                })
            } else {
                messageBox("You must be logged in to sell your cards.");
            }
        } else {
            addVariantToCart(event);
        }
    });
    $(".quickAddBuyBtn").click(function (event) {
        if ($(event.target).data("buyCPM")) {
            if (userLoggedIn) {
                messageBox("How many to add to cart?", {
                    showInput: true,
                    inputDefaultVal: "1000",
                    inputType: "number",
                    onSubmit: function (value, closeFunc) {
                        closeFunc();
                        event.buyQty = parseInt(value);
                        addVariantToCart(event);
                    }
                })
            } else {
                messageBox("You must be logged in to sell your cards.");
            }
        } else {
            addVariantToCart(event);
        }

    });
    $(".prodBuyListBanner").click(function (event) {
        toggleBuyMode(true);
        switchView("details");
    });
    $(".btnAddCarts").click(function (event) {
        var sender = $(event.target);
        var newTop = sender.offset().top + sender.outerHeight();
        var newLeft = sender.offset().left + sender.outerWidth() - $("#addCartsDropdown").outerWidth();
        $("#addCartsDropdown").css("top", newTop);
        $("#addCartsDropdown").css("left", newLeft);

        var mainBtn = sender.closest(".addCartBtnWrapper").find(".btnAddCart");
        if ($(event.target).closest(".deckOutput").length > 0) {
            console.log("in deck builder");
            $("#addCartsDropdown").data("addItems", getDeckBuilderItems());
        } else {
            var variantData = $(event.target).closest(".variant").data("variant");
            var quantityInt = parseInt($(event.target).closest(".variant").find(".quantity")[0].value);
            $("#addCartsDropdown").data("variant", variantData);
            $("#addCartsDropdown").data("quantity", quantityInt);
            $("#addCartsDropdown").data("senderBtn", mainBtn);
            $("#addCartsDropdown").removeData("addItems");
        }
        resetCartBtn = mainBtn;
        resetCartBtnText = mainBtn[0].innerText;
        mainBtn[0].innerText = "Add To ...";
        highlightOverlay(["#addCartsDropdown"], true);
    });

    $(".prodImage").on("error", function () {
        if ($(this).attr("src") != "") {
            $(this).attr('src', '');
            $(this).closest(".searchResult").removeClass("foil");
            $(this).addClass("noImage");
            // $(this).css("height","0px");
            // $(this).css("width","0px");
        }
    });
    $(".prodImage").on("load", function () {
        $(this).closest(".prodImageWrapper").find(".foilOverlay").removeClass("hidden");
    });

    $("#searchHeader .searchHeaderWrapper, #buyHeaderWrapper").on("click", ".toggleWrapper", function (event) {
        if ($(event.target).closest(".toggle").length) return;
        var thisCheckbox = $(event.currentTarget).find("input");
        var isChecked = thisCheckbox.prop("checked");
        thisCheckbox.bootstrapToggle(isChecked ? "off" : "on");
    })

    $("#searchFilterBtn").click(function () {
        resizeSearchFilterPanel();
        populateFilterPanel(searchRenderCache[currentRenderCacheID]);

        highlightOverlay(["#searchFilterPanel"]);
    })
    $("#searchLayoutGrid").click(function () {
        $("#searchLayoutGrid").addClass("active");
        $("#searchLayoutWide").removeClass("active");

        $("#search").removeClass("wideView");
        checkFoilViewports();
    });
    $("#searchLayoutWide").click(function () {
        $("#searchLayoutWide").addClass("active");
        $("#searchLayoutGrid").removeClass("active");

        $("#search").addClass("wideView");
        checkFoilViewports();
    });

    $("#searchFilter").keyup(function (event) {
        var start = Date.now();

        searchRenderCache[currentRenderCacheID].filterText = event.target.value;

        detachRenderCache(true);
        processSearchResultFilters(searchRenderCache[currentRenderCacheID]);
        attachRenderCache(searchRenderCache[currentRenderCacheID], true);
        console.log("filter time: " + (Date.now() - start));
    });
    $("#searchFilterPanelContents").on("change", "input", function (event) {
        var isChecked = $(event.target).prop("checked");
        var checkData = $(event.target).closest("label").data();

        var thisFilter = searchRenderCache[currentRenderCacheID].filters[checkData.name];
        if (isChecked) {
            if (!thisFilter.includes(checkData.value)) thisFilter.push(checkData.value);
        } else {
            var i = thisFilter.indexOf(checkData.value);
            if (i >= 0) {
                thisFilter.splice(i, 1);
            }
        }

        var toggles = $("#searchHeader .toggleWrapper input").toArray();
        toggles.forEach(function (toggle) {
            var toggleData = $(toggle).data();
            if (toggleData.name == checkData.name) {
                var shouldCheck = thisFilter.includes(toggleData.value) || thisFilter.length == 0;
                $(toggle).prop("checked", shouldCheck);
                toggleData["bs.toggle"].update(true);
            }
        })

        detachRenderCache(true);
        processSearchResultFilters(searchRenderCache[currentRenderCacheID]);
        attachRenderCache(searchRenderCache[currentRenderCacheID], true);
    })

    $("#menuSearch").keyup(function (event) {
        $('#mainMenu').jstree(true).search($("#menuSearch").val());
    });
    $("#menuSearch").keydown(function (event) {
        if (event.which == 27) {
            mainMenuSearchToggle(false);

        }
    });

    $(".fLink").click(function (event) {
        event.preventDefault();
        if ($(event.currentTarget).attr("href") === "/") {
            doHome();
        }
    });

    $("#cartButton").click(function (event) {
        doCart();
    });
    $("#deckBuilderBtn").click(function (event) {
        event.preventDefault();
        doDeckBuilder();
    });
    toggleBuyMode(false);

    $("#advancedSearchBtn").click(function (event) {
        event.preventDefault();
        loadSearch();
    });

    $(".submitDeckBuilder").click(function (event) {
        submitDeckBuilder();
    })

    $(".deckList").focus(function (event) {
        $(".deckList").select();
    })

    var origViewerMoveTo;
    var origViewerShow;
    var itemViewDetailsClick = function (event) {
        event.preventDefault();
        event.stopPropagation();

        if ($(this).closest(".searchResult").hasClass("full") || $(this).closest(".deckResult").length > 0) {
            if ($(event.currentTarget).hasClass("searchResultLeftTop")) return; //only zoom on image click
            console.log("zoom card");
            var zoomTimer;
            const viewer = new Viewer(this, {
                button: false,
                zIndex: 10000,
                toolbar: false,
                title: false,
                navbar: false,
                className: "viewerBorder",
                view() {
                    if (this.viewer.isFoil) {
                        if (zoomTimer) clearInterval(zoomTimer);
                        zoomTimer = setInterval(this.viewer.matchZoomOverlay, 25);
                    }

                    imageZoomedPath = window.location.pathname;
                    imageZoomedViewer = this.viewer;
                    imageZoomedState = history.state;
                },
                viewed() {
                    if (this.viewer.isFoil) {
                        clearInterval(zoomTimer);
                        zoomTimer = undefined;
                    }
                },
                zoom(event) {
                    if (this.viewer.isFoil) {
                        if (zoomTimer) clearInterval(zoomTimer);
                        zoomTimer = setInterval(this.viewer.matchZoomOverlay, 25);

                        //if image is double clicked at 100%, zoomed event never fires.  Clear it after 1 second.
                        var doubleZoomTimer = zoomTimer;
                        setTimeout(function () {
                            clearInterval(doubleZoomTimer);
                        }, 1000)
                    }
                },
                zoomed(event) {
                    if (this.viewer.isFoil) {
                        clearInterval(zoomTimer);
                        zoomTimer = undefined;
                    }
                },
                url(image) {
                    return image.src.replace('/small', '/normal');
                },
                hidden() {
                    // console.log("hidden");
                    if (zoomTimer) clearInterval(zoomTimer);
                    this.viewer.destroy();
                    imageZoomedViewer = false;
                }
            });
            viewer.isFoil = $(this).closest(".prodImageWrapper").find(".foilOverlay").hasClass("go");

            viewer.matchZoomOverlay = function () {
                console.log("matching foil overlay");
                var overlay = $(".viewer-canvas .foilOverlay");
                var underImage = $(".viewer-canvas .viewer-move")

                if (overlay.length > 0 && underImage.length > 0) {
                    overlay.css("cssText", "max-width: none !important;");
                    overlay.css({
                        "height": underImage.css("height"),
                        "width": underImage.css("width"),
                        "top": underImage.css("top"),
                        "left": underImage.css("left"),
                        "margin-left": underImage.css("margin-left"),
                        "margin-top": underImage.css("margin-top"),
                        "position": "absolute",
                        display: "block"
                    });
                    overlay.removeClass("hidden");
                }
            };
            if (origViewerMoveTo === undefined) {

                origViewerMoveTo = viewer.__proto__.moveTo;
                viewer.__proto__.moveTo = function () {
                    var origRes = origViewerMoveTo.apply(this, arguments);
                    if (this.isFoil) {
                        this.matchZoomOverlay();
                    }
                    return origRes;
                }
            }
            if (origViewerShow === undefined) {
                origViewerShow = viewer.__proto__.view;
                viewer.__proto__.view = function () {
                    var origRes = origViewerShow.apply(this, arguments);
                    if (this.isFoil) {
                        var newOverlay = resOrigParts.foilOverlay.clone();
                        newOverlay.addClass("go");
                        newOverlay.appendTo(".viewer-canvas");
                    }
                    return origRes;
                }
            }
            viewer.show();
        } else {

            var resData = $(this).closest(".searchResult").data("resData");
            if (resData.isBundle) {
                viewBundleDetails(resData.id, resData.categoryName, resData.inventoryName);
            } else {
                viewItemDetails(resData.inventoryID, resData.categoryName, resData.inventoryName);
            }
        }

    }
    $(".searchResult.hidden .prodDetailsBtn").click(itemViewDetailsClick);

    $(".searchResult.hidden .searchResultLeftTop").click(itemViewDetailsClick);
    $(".searchResult.hidden .prodImage").click(itemViewDetailsClick);
    $("#deckBuilder .deckResult.hidden .prodImage").click(itemViewDetailsClick);

    getJSON("getStoreSettings", { getBuyCart: true }, function (res) {
        if (res && res.result) {
            setTimeout(function () {
                $("#preLoad").remove();
                $("#container").fadeIn();
            }, 1)
            res = res.result;

            if (res.categories) {
                // categories
                res.categories.forEach(function (productType) {
                    productType.categories.forEach(function (category) {
                        categories[category.id] = category.name;
                    })
                })
            }

            if (res.buyStoreCreditMultiplier) {
                storeCreditBuyBonus = `${round((res.buyStoreCreditMultiplier - 1) * 100, 0, false)}%`;
                $("#checkoutBuyPaymentStoreCreditBonus").text(storeCreditBuyBonus);
            }

            if (res.customizations) {
                customizations = {};
                res.customizations.forEach(function (v) {
                    customizations[v.name] = v.value;
                })
                console.log(customizations);
                if (customizations.colors) {
                    customizations.colors = JSON.parse(customizations.colors);
                    if (customizations.colors.color1) document.documentElement.style.setProperty('--color1', customizations.colors.color1);
                    if (customizations.colors.color1b) document.documentElement.style.setProperty('--color1b', customizations.colors.color1b);
                    if (customizations.colors.color2) document.documentElement.style.setProperty('--color2', customizations.colors.color2);
                    if (customizations.colors.color2b) document.documentElement.style.setProperty('--color2b', customizations.colors.color2b);
                    if (customizations.colors.color2c) document.documentElement.style.setProperty('--color2c', customizations.colors.color2c);
                    if (customizations.colors.color3) document.documentElement.style.setProperty('--color3', customizations.colors.color3);
                    if (customizations.colors.color3b) document.documentElement.style.setProperty('--color3b', customizations.colors.color3b);
                    if (customizations.colors.color4) document.documentElement.style.setProperty('--color4', customizations.colors.color4);
                    if (customizations.colors.color4b) document.documentElement.style.setProperty('--color4b', customizations.colors.color4b);
                }

                if (!customizations.title) customizations.title = "";
                document.title = customizations.title;

                if (customizations.smallLogoURL) {
                    $("#floatHeaderLogo .logo").attr("src", customizations.smallLogoURL);
                    $("#mobileMenuHome .menuIcon").attr("src", customizations.smallLogoURL);
                }
                if (customizations.logoURL) $("#headerLeft .logo").attr("src", customizations.logoURL);

                if (customizations.headerBackgroundURL) $("#floatHeader").css("background", "url(" + customizations.headerBackgroundURL + ")");

                if (customizations.footerLogos) {
                    customizations.footerLogos = JSON.parse(customizations.footerLogos);
                    for (logo of customizations.footerLogos) {
                        if (logo.startsWith("/payment/")) {
                            logo = logo.replace("/payment/", "/") + ".svg";
                            $(`<img class="paymentIcon" src="/external/payment_icons/flat${logo}">`).appendTo("#footerLogos");
                        } else {
                            $(`<img src="${logo}">`).appendTo("#footerLogos");
                        }

                    }
                } else customizations.footerLogos = [];

                populateLandingBanners(res.banners);

                if (customizations.styleLandingBanner) {
                    customizations.styleLandingBanner = JSON.parse(customizations.styleLandingBanner);
                    styleLandingBanner(customizations.styleLandingBanner);
                } else {
                    $("#landingTabs > .nav-item > .nav-link").first().click();
                }

                var navBarStart = $("#navBarStart");
                if (customizations.navbar) {
                    customizations.navbar = JSON.parse(customizations.navbar);
                    for (nav of customizations.navbar) {
                        if (nav.subs.length > 0) {
                            var newDiv = $("<div></div>");
                            var newNav = $(`<a href="/store/pages/${nav.page}" class="dropdown-toggle" data-toggle="dropdown">${nav.name}</a>`);
                            newNav.appendTo(newDiv);
                            var newDropdown = $(`<div class="dropdown-menu"></div>`);

                            if (nav.name.toLowerCase() == "upcoming events") {
                                $("#upcomingEventsLink").appendTo(newDropdown).addClass("dropdown-item").html("Calendar<img>");
                            }
                            for (sub of nav.subs) {
                                var newDropdownItem = $(`<a class="dropdown-item pagesLink" href="/store/pages/${sub.page}" pagesTarget="${sub.page}">${sub.name}</a>`);
                                newDropdownItem.appendTo(newDropdown);
                            }
                            newDropdown.appendTo(newDiv);
                            newDiv.insertBefore(navBarStart);
                        } else {
                            var newNav = $(`<a href="/store/pages/${nav.page}" class="pagesLink" pagesTarget="${nav.page}">${nav.name}</a>`);
                            newNav.insertBefore(navBarStart);
                        }
                    }
                }
                navBarStart.remove();

                if (customizations.siteMessage) {
                    var siteMessage = $("#siteMessage");
                    siteMessage.html(customizations.siteMessage);
                    siteMessage.show();
                }

                var doSocialEmbed = true;
                if (customizations["facebook"]) {
                    if (doSocialEmbed) {
                        var newFacebookWidget = $(`<iframe src="https://www.facebook.com/plugins/page.php?href=https://www.facebook.com/${customizations["facebook"]}&tabs=timeline&width=450&height=300&small_header=true&adapt_container_width=true&hide_cover=false&show_facepile=false&appId" width="450" height="298" style="border:none;overflow:hidden" scrolling="no" frameborder="0" allowfullscreen="true" allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share" loading="lazy"></iframe>`);
                        newFacebookWidget.appendTo("#facebookWrapper");
                        doSocialEmbed = false;
                    } else {
                        $("#facebookWrapper").remove();
                    }

                    $("#facebookLink").attr("href", `https://www.facebook.com/${customizations["facebook"]}/`);
                } else {
                    $("#facebookLink").remove();
                    $("#facebookWrapper").remove();
                }
                if (customizations["twitter"]) {
                    if (doSocialEmbed) {
                        newTwitterWidget = $(`<a class="twitter-timeline" data-width="400" data-chrome="transparent nofooter noheader"
                            data-link-color="#F5F8FA" data-theme="dark" href="https://twitter.com/${customizations["twitter"]}?ref_src=twsrc%5Etfw">Tweets by ${customizations["twitter"]}</a>
                                <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>`);
                        newTwitterWidget.appendTo("#twitterWrapper");
                        doSocialEmbed = false;
                    } else {
                        $("#twitterWrapper").remove();
                    }

                    $("#twitterLink").attr("href", `https://www.twitter.com/${customizations["twitter"]}/`);
                } else {
                    $("#twitterLink").remove();
                    $("#twitterWrapper").remove();
                }
                if (customizations["instagram"]) {
                    $("#instagramLink").attr("href", `https://www.instagram.com/${customizations["instagram"]}/`);
                } else $("#instagramLink").remove();

                if (customizations["discord"]) {
                    $("#discordLink").attr("href", `${customizations["discord"]}`);
                } else $("#discordLink").remove();

                if (customizations["fullStoreName"]) {
                    $("#fullStoreName").text(customizations["fullStoreName"]);
                }

                if (customizations.faviconURL) {
                    $(`<link rel="shortcut icon" type="image/png" href="${customizations.faviconURL}">`).appendTo("head")
                }

                if (customizations.pages) {
                    customizations.pages = JSON.parse(customizations.pages);
                } else customizations.pages = [];

                if (customizations.creditCardPaymentLogos) {
                    customizations.creditCardPaymentLogos = JSON.parse(customizations.creditCardPaymentLogos);
                } else customizations.creditCardPaymentLogos = [];

                if (customizations.buyOrderPaymentMethods) {
                    customizations.buyOrderPaymentMethods = JSON.parse(customizations.buyOrderPaymentMethods);
                } else customizations.buyOrderPaymentMethods = false;

                if (customizations.buyOrderPaymentMethodModes) {
                    customizations.buyOrderPaymentMethodModes = JSON.parse(customizations.buyOrderPaymentMethodModes);
                } else customizations.buyOrderPaymentMethodModes = false;


                if (customizations.klaviyoEmbedID) {
                    $("#klaviyoEmbed").addClass(`klaviyo-form-${customizations.klaviyoEmbedID}`);
                }
                if (customizations.klaviyoCompanyID) {
                    $(`<script async type="text/javascript" src="https://static.klaviyo.com/onsite/js/klaviyo.js?company_id=${customizations.klaviyoCompanyID}"></script>`).appendTo("#klaviyoEmbed");
                }

                if (customizations.fbCustomerChatID) {
                    console.log(customizations.fbCustomerChatID);
                    $(`<div id="fb-root"></div>`).appendTo("body");
                    $(`<div id="fb-customer-chat" class="fb-customerchat" page_id="${customizations.fbCustomerChatID}" attribution="biz_inbox"></div>`).appendTo("body");
                    // $(`<script>
                    //     var chatbox = document.getElementById('fb-customer-chat');
                    //     chatbox.setAttribute("page_id", "107067322004003");
                    //     chatbox.setAttribute("attribution", "biz_inbox");
                    // </script>`).appendTo("body");

                    $(`<script>
                        window.fbAsyncInit = function () {
                            FB.init({
                                xfbml: true,
                                version: 'v13.0'
                            });
                        };
            
                        (function (d, s, id) {
                            var js, fjs = d.getElementsByTagName(s)[0];
                            if (d.getElementById(id)) return;
                            js = d.createElement(s); js.id = id;
                            js.src = 'https://connect.facebook.net/en_US/sdk/xfbml.customerchat.js';
                            fjs.parentNode.insertBefore(js, fjs);
                        }(document, 'script', 'facebook-jssdk'));
                    </script>`).appendTo("body");
                }
                if (customizations.googleAnalyticsID) {
                    var debugMode = window.location.host.includes("aaateststore");
                    $(`<script async src="https://www.googletagmanager.com/gtag/js?id=${customizations.googleAnalyticsID}"></script>`).appendTo("head");
                    $(`<script>
                        window.dataLayer = window.dataLayer || [];
                        function gtag() { dataLayer.push(arguments); }
                        gtag('js', new Date());
            
                        gtag('config', '${customizations.googleAnalyticsID}'${debugMode ? ", { 'debug_mode':true }" : ""});
                    </script>`).appendTo("head");
                }
                if (customizations.microsoftClarityID) {
                    $(`<script type="text/javascript">
                        (function(c,l,a,r,i,t,y){
                            c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
                            t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
                            y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
                        })(window, document, "clarity", "script", "${customizations.microsoftClarityID}");
                    </script>`).appendTo("head");
                }

                if (customizations.stripePublishableKey) {
                    function affixScriptToHead(url, onloadFunction) {
                        const newScript = document.createElement("script");
                        // newScript.onerror = loadError;
                        if (onloadFunction) { newScript.onload = onloadFunction; }
                        document.head.appendChild(newScript);
                        newScript.src = url;
                    }
                    affixScriptToHead("https://js.stripe.com/v3/", function (event) {
                        console.log("Stripe Loaded");
                    })
                }

                if (customizations.checkoutInStorePaymentEnabled) {
                    customizations.checkoutInStorePaymentEnabled = JSON.parse(customizations.checkoutInStorePaymentEnabled);
                } else customizations.checkoutInStorePaymentEnabled = false;
                if (customizations.noCreditCardProcessor) {
                    customizations.noCreditCardProcessor = JSON.parse(customizations.noCreditCardProcessor);
                } else customizations.noCreditCardProcessor = false;
            } else {
                customizations = {};
            }

            if (res.defaultCurrency) storeCurrency = res.defaultCurrency;
            if (res.defaultCurrency && res.defaultCurrency == "USD") {
                taxTypeMap.gst = "Tax";
                taxTypeMap.pst = "Tax";
                taxTypeMap.hst = "Tax";
            }
            if (res.storeCountry) {
                storeCountry = res.storeCountry;
                $("#cart .cartItem.hidden .cartItemDomesticOnly").text(`${storeCountry} Only`);
            }
            if (res.storeTimeZone) {
                storeTimeZone = res.storeTimeZone;
            }

            if (res.paypalClientID && res.defaultCurrency) {
                paypalClientID = res.paypalClientID;
                var paypalScript = $('<script src="https://www.paypal.com/sdk/js?client-id=' + paypalClientID + '&currency=' + res.defaultCurrency + '&intent=authorize"></script>');
                paypalScript.appendTo("head");
            } else {
                $("#paymentTypePayPal").closest("label").hide();
            }

            if (customizations.noCreditCardProcessor) {
                $("#paymentTypeCard").closest("label").hide();
            }
            if (customizations.checkoutInStorePaymentEnabled) {
                $("#paymentTypePayLater").closest("label").find("img").attr("src", customizations.smallLogoURL);
            } else {
                $("#paymentTypePayLater").closest("label").hide();
            }

            if (res.productTypes && res.productTypes.length > 0) {
                makeSearchProductTypes(res.productTypes);
                makeSearchFilters(res.productTypes);
                makeSearchSorts(res.productTypes);
            }
            var magicSinglesProductTypeExists = res.productTypes.some(v => v.name.toLowerCase().includes("magic"))
            if (!magicSinglesProductTypeExists) {
                $("#deckBuilderBtn").remove();
            }

            populateBestSellers(res.bestSellers);

            loadStorePath();
            if (res.sessionID) {
                sessionID = res.sessionID;
                setCookie("sessionID", sessionID);
                console.log("new sessionID: " + sessionID);
            }
            if (res.appClientID) {
                appClientID = res.appClientID;
                setCookie("appClientID", appClientID);
                console.log("new appClientID: " + appClientID);
            }
            if (res.userPoolID) {
                userPoolID = res.userPoolID;
                setCookie("userPoolID", userPoolID);
                console.log("new userPoolID: " + userPoolID);
            }

            if (res.shippingCountries && res.shippingCountries.length > 0) {
                var countryElm = addressEditor.find("#countryAddress");
                countryElm.empty();
                $(`<option value selected></option>`).appendTo(countryElm);
                for (nextCountry of res.shippingCountries) {
                    $(`<option value="${nextCountry}">${nextCountry}</option>`).appendTo(countryElm);
                }
                countryElm.val("");
            }

            if (res.carts && res.carts.length > 0) {
                makeCarts(res.carts);
            }

            deckBuilderConditions = res.magicConditions;
            if (deckBuilderConditions) {
                deckBuilderConditions.forEach(function (val, i) {
                    $("<option value='" + i + "'" + (val.default ? "selected='selected'" : "") + ">" + val.name + " or better</option>").appendTo("#deckBuilder .minimumQualitySelect");
                })
            }


            if (res.categoriesOLDzzz) {
                var newLevel1;
                var newLevel2;
                var count = 0;
                res.categoriesOLD.forEach(function (val) {
                    if (!val.includes("-- ")) {

                        if (newLevel1 && (count % 3 !== 0)) {
                            var newHolder = $('<div class="menuLevel3Holder"></div>');
                            newHolder.appendTo(newLevel1);
                        }
                        newLevel1 = $('<div class="menuBtn"><div class="textBox">' + val + '</div><span class="fas fa-angle-right arrow" style="margin-top: 3px; margin-right: 10px;"></span><div class="menuLevel1"></div></div>');
                        newLevel1.appendTo("#categories");
                        newLevel1 = newLevel1.find(".menuLevel1");
                        count = 0;

                    } else {
                        if (!val.includes("---- ")) {
                            if (newLevel1) {
                                var newHolder = $('<div class="menuLevel3Holder"></div>');
                                // newHolder.appendTo(newLevel1);
                            }
                            val = val.replace("-- ", "");
                            newLevel2 = $('<div class="menuLevel2"><div class="textBox">' + val + '</div></div>');
                            newLevel2.appendTo(newLevel1);

                            count++;
                            if (count % 3 == 0) {
                                var newHolder = $('<div class="menuLevel3Holder"></div>');
                                newHolder.appendTo(newLevel1);
                            }
                        } else {
                            if (!newLevel2.find(".fa-angle-down").length) {
                                $('<span class="fas fa-angle-down arrow"></span>').appendTo(newLevel2);
                            }

                            val = val.replace("---- ", "");
                            var newLevel3 = $('<div class="menuLevel3">' + val + '</div>');
                            newLevel3.appendTo(newLevel2);


                        }
                    }
                })
                attachMenuHandlers();


            }

            if (res.menu && res.menu.menuDef) {
                var menuData = JSON.parse(res.menu.menuDef);
                var mainMenuItemIndex = menuData.findIndex(menuItem => menuItem.text === "Main Menu");
                var mainMenuItem = menuData[mainMenuItemIndex];
                menuData.forEach(function (menuItem) {
                    if (menuItem.parent === mainMenuItem.id) {
                        menuItem.parent = "#";
                        menuItem.state = "leaf";
                    }
                    var categoryID = menuItem && menuItem.data && menuItem.data.category;
                    if (categoryID) {
                        var url = "/store/category/" + categories[categoryID];
                        menuItem.a_attr = {
                            href: url
                        }
                    }

                })
                menuData.splice(mainMenuItemIndex, 1);

                $('#mainMenu').jstree({
                    'core': {
                        "check_callback": true,
                        "animation": 200,
                        dblclick_toggle: false,
                        data: menuData,
                        "themes": {
                            dots: false,
                            "variant": "large"
                        }
                    },
                    search: {
                        show_only_matches: true,
                        // show_only_matches_children: true,
                        search_leaves_only: true
                    },
                    "plugins": ["wholerow", "search"],
                }).on('click', '.jstree-anchor', function (event) {
                    // $('#mainMenu').jstree(true).open_node(event.target);
                    var clickedNode = $('#mainMenu').jstree(true).get_node(event.target);
                    console.log(clickedNode);
                    var nodeCategory = clickedNode.data.category;
                    if (nodeCategory) {
                        console.log(nodeCategory)
                        mainMenuHide();
                        loadSearch(categories[nodeCategory], true);
                        var that = this;
                        setTimeout(function () {
                            $(that).blur();
                        })
                    } else {
                        $('#mainMenu').jstree(true).toggle_node(event.target);
                    }
                }).on("loaded.jstree", function () {
                    // $(".jstree-ocl").hide();
                });

            }
        }
    });

    $(".catButton.hidden").click(function (event) {
        loadSearch(event.target.innerHTML, true);
    });



    productSearch = $('#productSearch').selectize({
        placeholder: "Product Search",
        plugins: ['continue_editing', 'restore_on_backspace', 'preserve_on_blur'],
        valueField: 'inventoryName',
        labelField: 'inventoryName',
        searchField: 'inventoryName',
        loadThrottle: 300,
        onType: function (str) {
            console.log("onType: " + str);
            productSearch[0].selectize.clearOptions();
            productSearch[0].selectize.addOption({ $order: 1, "inventoryName": str });
            productSearch[0].selectize.refreshOptions();
            this.loadingQuery = str;
            this.showSuggestions = true;
        },
        onDropdownOpen: function (dropdown) {
            if (this.selectedText) productSearch[0].selectize.onSearchChange(this.selectedText);
        },
        onDropdownClose: function (dropdown) {
            this.selectedText = productSearch[0].selectize.$control_input.val();
        },
        score: function (search) {
            var score = this.getScoreFunction(search);
            return function (item) {
                res = score(item);
                if (item.$order == 1) res = 1.0;
                // || item.inventoryName == last
                // console.log(item);
                console.log(res);
                return res;
            };
        },
        load: function (query, callback) {
            var that = this;
            if (query && query.length > 0) {
                var productTypeID = $("#productSearchCategories").val();
                if (productTypeID == "0") productTypeID = undefined;
                getJSON("getSearchSuggestions", { search: query, productTypeID: productTypeID }, function (res) {
                    if (that.loadingQuery == query) {
                        if (res && res.success) {
                            productSearch[0].selectize.clearOptions();
                            productSearch[0].selectize.addOption({ $order: 1, "inventoryName": query });
                            callback(res.result.suggestions);
                            productSearch[0].selectize.refreshOptions(that.showSuggestions);
                        }
                    }
                })
            }

        },
        onItemAdd: function (value, item) {
            this.selectedText = value;
            console.log(value);
            this.showSuggestions = false;
            productSearch[0].selectize.clearOptions();
            loadSearch(value, false);
        }

    });
    $("#floatHeaderSearch").submit(function (event) {
        event.preventDefault();
    })
    productSearchCategories = $('#productSearchCategories').selectize({
        create: false
    });

    var myPositionDropdown = function () {
        var $control = this.$control;
        var offset = this.settings.dropdownParent === 'body' ? $control.offset() : $control.position();
        offset.top += $control.outerHeight(true);

        // this.$dropdown.css("position", "fixed");
        // this.$dropdown.css("left", $(this[0]).parent().offset().left);
        // this.$dropdown.css("top", $(this[0]).parent().offset().top + $(this[0]).parent().outerHeight() + 1);

        if (this.readonly) $control.find("input").attr("readonly", "true");
        this.$dropdown.css({
            position: "fixed",
            width: this.variableWidth ? "" : $control[0].getBoundingClientRect().width,
            top: $control.parent().offset().top + $control.parent().outerHeight() + 1 - $(document).scrollTop(), //offset.top,
            left: $control.parent().offset().left - $(document).scrollLeft()//offset.left
        });
    }

    productSearch[0].selectize.positionDropdown = myPositionDropdown;
    productSearchCategories[0].selectize.positionDropdown = myPositionDropdown;
    productSearchCategories[0].selectize.variableWidth = true;
    productSearchCategories[0].selectize.readonly = true;

});
