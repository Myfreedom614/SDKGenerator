var fs = require("fs");
var path = require("path");

// Making resharper less noisy - These are defined in Generate.js
if (typeof (copyTree) === "undefined") copyTree = function () { };
if (typeof (getCompiledTemplate) === "undefined") getCompiledTemplate = function () { };

exports.putInRoot = true;

exports.makeCombinedAPI = function (apis, sourceDir, apiOutputDir) {
    apiOutputDir = path.resolve(apiOutputDir, "PfApiTest"); // This is an oddity in the ActionScriptSDK which we shouldn't resolve until we do a major revision number change

    console.log("Generating ActionScript3 combined SDK to " + apiOutputDir);

    removeExcessFiles(apis, apiOutputDir);
    copyTree(path.resolve(sourceDir, "source"), apiOutputDir);

    for (var i = 0; i < apis.length; i++) {
        makeDatatypes(apis[i], sourceDir, apiOutputDir);
        makeApi(apis[i], sourceDir, apiOutputDir);
    }

    generateSimpleFiles(apis, sourceDir, apiOutputDir);
}

function removeFilesInDir(dirPath, searchFilter) {
    var files;
    try { files = fs.readdirSync(dirPath); }
    catch (e) { return; }
    if (files.length > 0)
        for (var i = 0; i < files.length; i++) {
            var filePath = path.resolve(dirPath, files[i]);
            if (fs.statSync(filePath).isFile() && (!searchFilter || filePath.contains(searchFilter)))
                fs.unlinkSync(filePath);
        }
};

function removeExcessFiles(apis, apiOutputDir) {
    for (var a = 0; a < apis.length; a++)
        removeFilesInDir(path.resolve(apiOutputDir, "com/playfab/" + apis[a].name + "Models"), ".as");
}

function getBaseTypeSyntax(datatype) {
    // The model-inheritance feature was removed.
    // However in the future, we may still use some inheritance links for request/result baseclasses, for other sdk features
    if (datatype.name.endsWith("Result") || datatype.name.endsWith("Response"))
        return "";
    if (datatype.name.endsWith("Request"))
        return "";
    return "";
}

function makeDatatypes(api, sourceDir, apiOutputDir) {
    var templateDir = path.resolve(sourceDir, "templates");
    var modelTemplate = getCompiledTemplate(path.resolve(templateDir, "Model.as.ejs"));;
    var enumTemplate = getCompiledTemplate(path.resolve(templateDir, "Enum.as.ejs"));;

    for (var d in api.datatypes) {
        if (!api.datatypes.hasOwnProperty(d))
            continue;

        var eachDatatype = api.datatypes[d];

        var modelLocals = {
            api: api,
            datatype: eachDatatype,
            getBaseTypeSyntax: getBaseTypeSyntax,
            getDeprecationComment: getDeprecationComment,
            getModelPropertyDef: getModelPropertyDef,
            getModelPropertyInit: getModelPropertyInit
        };

        var generatedModel;
        if (eachDatatype.isenum) {
            generatedModel = enumTemplate(modelLocals);
        } else {
            modelLocals.needsPlayFabUtil = needsPlayFabUtil(eachDatatype);
            generatedModel = modelTemplate(modelLocals);
        }

        writeFile(path.resolve(apiOutputDir, "com/playfab/" + api.name + "Models/" + eachDatatype.name + ".as"), generatedModel);
    }
}

// A datatype needs util if it contains a DateTime
function needsPlayFabUtil(datatype) {
    for (var i = 0; i < datatype.properties.length; i++)
        if (datatype.properties[i].actualtype === "DateTime")
            return true;
    return false;
}

function makeApi(api, sourceDir, apiOutputDir) {
    console.log("Generating ActionScript " + api.name + " library to " + apiOutputDir);

    var apiLocals = {
        api: api,
        getAuthParams: getAuthParams,
        getRequestActions: getRequestActions,
        getResultActions: getResultActions,
        getDeprecationAttribute: getDeprecationAttribute,
        hasClientOptions: api.name === "Client"
    };

    var apiTemplate = getCompiledTemplate(path.resolve(path.resolve(sourceDir, "templates"), "API.as.ejs"));;
    writeFile(path.resolve(apiOutputDir, "com/playfab/PlayFab" + api.name + "API.as"), apiTemplate(apiLocals));
}

function generateSimpleFiles(apis, sourceDir, apiOutputDir) {
    var simpleLocals = {
        buildIdentifier: exports.buildIdentifier,
        errorList: apis[0].errorList,
        errors: apis[0].errors,
        hasClientOptions: false,
        hasServerOptions: false,
        sdkVersion: exports.sdkVersion
    };
    for (var i = 0; i < apis.length; i++) {
        if (apis[i].name === "Client")
            simpleLocals.hasClientOptions = true;
        else
            simpleLocals.hasServerOptions = true;
    }

    var errorsTemplate = getCompiledTemplate(path.resolve(sourceDir, "templates/Errors.as.ejs"));;
    writeFile(path.resolve(apiOutputDir, "com/playfab/PlayFabError.as"), errorsTemplate(simpleLocals));

    var versionTemplate = getCompiledTemplate(path.resolve(sourceDir, "templates/PlayFabVersion.as.ejs"));;
    writeFile(path.resolve(apiOutputDir, "com/playfab/PlayFabVersion.as"), versionTemplate(simpleLocals));

    var settingsTemplate = getCompiledTemplate(path.resolve(sourceDir, "templates/PlayFabSettings.as.ejs"));;
    writeFile(path.resolve(apiOutputDir, "com/playfab/PlayFabSettings.as"), settingsTemplate(simpleLocals));
}

function getModelPropertyDef(property, datatype) {
    var basicType = getPropertyAsType(property, datatype);

    if (property.collection) {
        if (property.collection === "array") {
            return property.name + ":Vector.<" + basicType + ">";
        }
        else if (property.collection === "map") {
            return property.name + ":Object";
        }
        else {
            throw "Unknown collection type: " + property.collection + " for " + property.name + " in " + datatype.name;
        }
    }
    else {
        if (property.optional && (basicType === "Boolean"
            || basicType === "int"
            || basicType === "uint"
            || basicType === "Number"))
            basicType = "*";
        return property.name + ":" + basicType;
    }
}

function getPropertyAsType(property, datatype) {

    if (property.actualtype === "String")
        return "String";
    else if (property.actualtype === "Boolean")
        return "Boolean";
    else if (property.actualtype === "int16")
        return "int";
    else if (property.actualtype === "uint16")
        return "uint";
    else if (property.actualtype === "int32")
        return "int";
    else if (property.actualtype === "uint32")
        return "uint";
    else if (property.actualtype === "int64")
        return "Number";
    else if (property.actualtype === "uint64")
        return "Number";
    else if (property.actualtype === "float")
        return "Number";
    else if (property.actualtype === "double")
        return "Number";
    else if (property.actualtype === "decimal")
        return "Number";
    else if (property.actualtype === "DateTime")
        return "Date";
    else if (property.isclass)
        return property.actualtype;
    else if (property.isenum)
        return "String";
    else if (property.actualtype === "object")
        return "Object";
    throw "Unknown property type: " + property.actualtype + " for " + property.name + " in " + datatype.name;
}

function getModelPropertyInit(tabbing, property, datatype) {
    if (property.isclass) {
        if (property.collection) {
            if (property.collection === "array")
                return tabbing + "if(data." + property.name + ") { " + property.name + " = new Vector.<" + property.actualtype + ">(); for(var " + property.name + "_iter:int = 0; " + property.name + "_iter < data." + property.name + ".length; " + property.name + "_iter++) { " + property.name + "[" + property.name + "_iter] = new " + property.actualtype + "(data." + property.name + "[" + property.name + "_iter]); }}";
            else if (property.collection === "map")
                return tabbing + "if(data." + property.name + ") { " + property.name + " = {}; for(var " + property.name + "_iter:String in data." + property.name + ") { " + property.name + "[" + property.name + "_iter] = new " + property.actualtype + "(data." + property.name + "[" + property.name + "_iter]); }}";
            else
                throw "Unknown collection type: " + property.collection + " for " + property.name + " in " + datatype.name;
        }
        else {
            return tabbing + property.name + " = new " + property.actualtype + "(data." + property.name + ");";
        }
    }
    else if (property.collection) {
        if (property.collection === "array") {
            var asType = getPropertyAsType(property, datatype);
            return tabbing + property.name + " = data." + property.name + " ? Vector.<" + asType + ">(data." + property.name + ") : null;";
        }
        else if (property.collection === "map") {
            return tabbing + property.name + " = data." + property.name + ";";
        }
        else {
            throw "Unknown collection type: " + property.collection + " for " + property.name + " in " + datatype.name;
        }
    }
    else if (property.actualtype === "DateTime") {
        return tabbing + property.name + " = PlayFabUtil.parseDate(data." + property.name + ");";
    }
    else {
        return tabbing + property.name + " = data." + property.name + ";";
    }
}

function getAuthParams(apiCall) {
    if (apiCall.auth === "SecretKey")
        return "\"X-SecretKey\", PlayFabSettings.DeveloperSecretKey";
    else if (apiCall.auth === "SessionTicket")
        return "\"X-Authorization\", authKey";
    return "null, null";
}

function getRequestActions(tabbing, apiCall, api) {
    if (api.name === "Client" && (apiCall.result === "LoginResult" || apiCall.request === "RegisterPlayFabUserRequest"))
        return tabbing + "request.TitleId = PlayFabSettings.TitleId != null ? PlayFabSettings.TitleId : request.TitleId;\n"
            + tabbing + "if(request.TitleId == null) throw new Error (\"Must be have PlayFabSettings.TitleId set to call this method\");";
    if (api.name === "Client" && apiCall.auth === "SessionTicket")
        return tabbing + "if (authKey == null) throw new Error(\"Must be logged in to call this method\");";
    if (apiCall.auth === "SecretKey")
        return tabbing + "if (PlayFabSettings.DeveloperSecretKey == null) throw new Error (\"Must have PlayFabSettings.DeveloperSecretKey set to call this method\");";
    return "";
}

function getResultActions(tabbing, apiCall, api) {
    if (api.name === "Client" && (apiCall.result === "LoginResult" || apiCall.result === "RegisterPlayFabUserResult"))
        return tabbing + "authKey = result.SessionTicket != null ? result.SessionTicket : authKey;\n"
            + tabbing + "MultiStepClientLogin(result.SettingsForUser.NeedsAttribution);\n";
    else if (api.name === "Client" && apiCall.result === "AttributeInstallResult")
        return tabbing + "// Modify AdvertisingIdType:  Prevents us from sending the id multiple times, and allows automated tests to determine id was sent successfully\n"
            + tabbing + "PlayFabSettings.AdvertisingIdType += \"_Successful\";\n";
    return "";
}

function getDeprecationAttribute(tabbing, apiObj) {
    var isDeprecated = apiObj.hasOwnProperty("deprecation");

    if (isDeprecated && apiObj.deprecation.ReplacedBy != null)
        return tabbing + "[Deprecated(message=\"The " + apiObj.name + " API and its associated datatypes are scheduled for deprecation. Use " + apiObj.deprecation.ReplacedBy + " instead.\", replacement=\"" + apiObj.deprecation.ReplacedBy + "\")]\n";
    else if (isDeprecated)
        return tabbing + "[Deprecated(message=\"The " + apiObj.name + " API and its associated datatypes are scheduled for deprecation.\")]\n";
    return "";
}

// Basically, deprecating fields and models causes tons of deprecation warnings against ourself,
//   making it nearly impossible to display to the user when THEY are using deprecated fields.
function getDeprecationComment(tabbing, apiObj) {
    var isDeprecated = apiObj.hasOwnProperty("deprecation");

    if (isDeprecated && apiObj.deprecation.ReplacedBy != null)
        return tabbing + "// Deprecated, please use " + apiObj.deprecation.ReplacedBy + "\n";
    else if (isDeprecated)
        return tabbing + "// Deprecated\n";
    return "";
}
