var CryptoJS = require('./googaes.js').CryptoJS;
CryptoJS.JsonFormatter = {
        stringify: function (cipherParams) {
            // create json object with ciphertext
            var jsonObj = {
                AB1: cipherParams.ciphertext.toString(CryptoJS.enc.Base64)
            };

            // optionally add iv and salt
            if (cipherParams.iv) {
                jsonObj.AB2 = cipherParams.iv.toString();
            }
            if (cipherParams.salt) {
                jsonObj.AB3 = cipherParams.salt.toString();
            }

            // stringify json object
            return JSON.stringify(jsonObj);
        },

        parse: function (jsonStr) {
            // parse json string
            var jsonObj = JSON.parse(jsonStr);

            // extract ciphertext from json object, and create cipher params object
            var cipherParams = CryptoJS.lib.CipherParams.create({
                ciphertext: CryptoJS.enc.Base64.parse(jsonObj.AB1)
            });

            // optionally extract iv and salt
            if (jsonObj.AB2) {
                cipherParams.iv = CryptoJS.enc.Hex.parse(jsonObj.AB2)
            }
            if (jsonObj.AB3) {
                cipherParams.salt = CryptoJS.enc.Hex.parse(jsonObj.AB3)
            }

            return cipherParams;
        }
    };
exports.CryptoJS = CryptoJS;
