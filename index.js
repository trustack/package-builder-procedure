const fs = require('fs');
const path = require('path');
const tar = require('tar');
const axios = require('axios');
const FormData = require('form-data');
const del = require('del');

class PackageBuilder {
  /**
   * Constructor
   * @param {*} inputVar 
   * @param {*} secrets 
   */
  constructor(inputVar, secretsVar) {
    this.procedureCode = inputVar.code; // expected: {'file1.js':'data', 'file2.js':'data'}
    this.secrets = secretsVar;
    this.encryptKey = inputVar.encryptKey;
    if (secretsVar == null) return;
    this.pinataApiKey = secretsVar.pinataApiKey;
    this.pinataSecretApiKey = secretsVar.pinataSecretApiKey;
  }

  packageSecrets(targetPath, secrets) {
    this.writeToFile('secrets.js', targetPath, JSON.stringify(secrets));
  }

  prepareTempFolder() {
    if (!fs.existsSync('Procedures')) {
      fs.mkdirSync('Procedures');
    }
    let tmpFolderPath = fs.mkdtempSync(path.join('Procedures', 'temp-'));
    return tmpFolderPath;
  }

  /**
   * Writes a file
   * @param {*} filename 
   * @param {*} targetPath 
   * @param {*} data 
   * @returns 
   */
  writeToFile(filename, targetPath, data) {
    let tmpFilePath = fs.writeFileSync(path.join(targetPath, filename), data);
    return tmpFilePath;
  }

  async cleanUp(path) {
    console.log(path);
    try{
    await del(path); 
    } catch(err){
      console.log(err);
    }
    return;
    fs.rm(path, { recursive: true, force: true }, (err) => {
      if (err) {
        throw err;
      }
      console.log(`${path} is deleted!`);
    });
  }

  preparePackageManifest(options, tmpFolder) {
    let manifest = `{
        "name": "<tbd>",
        "version": "1.0.0",
        "description": "<tbd>",
        "main": "index.js",
        "scripts": {
          "test": "echo 'Error: no test specified' && exit 1"
        },
        "keywords": [
          "trustack",
          "procedure"
        ],
        "author": "",
        "license": ""
      }
    `;
    this.writeToFile('package.json', tmpFolder, manifest);
  }

  async gzipPackage(rootFolder, outputFilename) {
    return new Promise((resolve, reject) => {

      let fileList = fs.readdirSync(rootFolder);
      tar.c(
        {
          gzip: true,
          file: path.join(rootFolder, `${outputFilename}.tgz`),
        },
        [rootFolder]
      ).then(_ => {
        resolve(true);
      }).catch((err) => {
        reject(err);
      })
    })
  }

  addToIpfs(filename) {
    const url = `https://api.pinata.cloud/pinning/pinFileToIPFS`;
    //we gather a local file for this example, but any valid readStream source will work here.
    let data = new FormData();
    data.append('file', fs.createReadStream(filename));

    return axios
      .post(url, data, {
        maxBodyLength: 'Infinity', //this is needed to prevent axios from erroring out with large files
        headers: {
          'Content-Type': `multipart/form-data; boundary=${data._boundary}`,
          pinata_api_key: this.pinataApiKey,
          pinata_secret_api_key: this.pinataSecretApiKey
        }
      })
      .then(function (response) {
        console.log(response);
        return response.data.IpfsHash;
        //handle response here
      })
      .catch(function (error) {
        return error;
        //handle error here
      });
  }

}

PackageBuilder.run_procedure = function (input = null, secrets = null) {
  return new Promise(async (resolve, reject) => {
    /* Expected input JSON schema:
{ input :{
  procedureCode: "code of the procedure",
  encryptKey: "publicKey used to encrypt the secrets - will identify decrypt key on Trustack network ",
}  }
{secrets: {
    pinataApiKey:"api key for pinata.cloud; encrypted with publicKey",
    pinataSecretApiKey: "secret key for pinata.cloud; encrypted with publicKey"
  }
  }
    */
    let inputs = input;
    let packageBuilder;

    let tmpFolderPath;
    try {
      packageBuilder = new PackageBuilder(input, secrets);
      tmpFolderPath = packageBuilder.prepareTempFolder();
      packageBuilder.preparePackageManifest(null, tmpFolderPath);
      if (inputs.secrets) {
        packageBuilder.packageSecrets(tmpFolderPath, inputs.secrets);
      }
      for (let key in inputs.procedureCode) {
        let code = inputs.procedureCode[key];
        let filename = key;
        packageBuilder.writeToFile(filename, tmpFolderPath, code);
      }
      
      await packageBuilder.gzipPackage('Procedures', tmpFolderPath.split('\\')[1]);
      
      if(input.doPublish == false) return;
      let ipfsAddress = await packageBuilder.addToIpfs(path.join('Procedures', tmpFolderPath.split('\\')[1]));
      resolve(ipfsAddress);
    } catch (err) {
      reject(err.toString());
    } finally {
      await packageBuilder.cleanUp(tmpFolderPath);
    }
  });
}

module.exports = PackageBuilder.run_procedure;