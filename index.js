const fs = require('fs');
const path = require('path');
const tar = require('tar');
const axios = require('axios');
const FormData = require('form-data');
const { subtle } = require('crypto').webcrypto;
const crypto = require('crypto');
const https = require('https');
const del = require('del');
const ignore = require('ignore');

const pubKeyUrl = "https://trustack.mypinata.cloud/ipfs/QmY2T5iJUF1X6U9AwHZsEJpzYzsFm1m5fSLpZeKgXzPW7c";

async function encryptSecret(text, publicKey) {
  return new Promise((resolve, reject) => {
    try {
      let encodedText = Buffer.from(text, "utf-8"); //crypto.stringToArrayBuffer(text)
      let keyObj = crypto.createPublicKey(publicKey);

      let encrypted = { cipher: [] };
      let leftover = encodedText.length
      let start = 0;
      let end = encodedText.length < 200 ? encodedText.length : 200;
      let inc = 0;
      do {
        let buf = Buffer.alloc(200);
        encodedText.copy(buf, start, end);
        let cipherBuf = crypto.publicEncrypt(publicKey, buf);
        encrypted.cipher[inc] = cipherBuf;
        inc++;
        start = end + 1;
        end = start + 200 > encodedText.length ? encodedText.length : (200 + start);
        //leftover = encodedText.length - end;
        leftover = encodedText.length - end;
      }
      while (leftover > 200);

      resolve(encrypted);
      //});
    } catch (err) {
      reject(err);
    }
  })
}

async function loadPubKey(keyUrl, pubKeyObj = null) {
  return new Promise((resolve, reject) => {
    https.get(pubKeyUrl, (res) => {
      try {
        res.pubKeyPem = "";
        res.on('data', async (d) => {
          res.pubKeyPem += d.toString();
        });

        res.on('end', function () {
          resolve(res.pubKeyPem);
        });
      } catch (err) {
        reject(err);
      }
    });
  });
}

class PackageBuilder {
  /**
   * Constructor
   * @param {*} inputVar 
   * @param {*} secrets 
   */
  constructor(inputVar, secretsVar, pubKeyUrl) {
    this.procedureCode = inputVar.code; // expected: {'file1.js':'data', 'file2.js':'data'}
    this.secrets = secretsVar;
    this.encryptKey = inputVar.encryptKey;
    if (secretsVar == null) return;
    this.pinataApiKey = secretsVar.pinataApiKey;
    this.pinataSecretApiKey = secretsVar.pinataSecretApiKey;
    //this.pubKey = await loadPubKey(pubKeyUrl);
  }

  async init() {
    let keyStr = await loadPubKey(pubKeyUrl);
    this.pubKey = keyStr;
  }

  async packageSecrets(targetPath, secrets) {
    try {
      console.log(`Encrypting secrets, writing them out to ${path.resolve(targetPath)}/secrets.json`);
      let encrypted = await encryptSecret(JSON.stringify(secrets), this.pubKey);
      this.writeToFile('secrets.json', targetPath, encrypted);
    } catch (err) {
      console.error("Failed to package encrypted secrets.");
      throw (err);
    }
    return true;
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
    let tmpFilePath = fs.writeFileSync(path.join(targetPath, filename), JSON.stringify(data));
    return tmpFilePath;
  }

  async cleanUp(path) {
    console.log(path);
    try {
      await del(path);
    } catch (err) {
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

  /**
   * Will filter out the file list according to a .gitignore file.
   * @param {string} rootFolder Root path of the Procedure, i.e., where the .gitignore file is
   * @param {string} fileList The list of file paths in the Procedure, to be filtered.
   * @returns {string[]} A new array of file paths
   */
  async getExcludeList(rootFolder, fileList) {
    return new Promise(async (resolve, reject) => {
      console.log(`Processing ${rootFolder}/.gitignore`);
      try {
        let newFileList = [];
        let ignoreFilePath = path.join(rootFolder, '.gitignore');
        if (fs.existsSync(ignoreFilePath)) {
          let fileData = await fs.promises.readFile(ignoreFilePath, { encoding: 'utf-8' });
          const ignoreFiles = fileData.split(/\r?\n/);
          const ig = ignore().add(ignoreFiles);
          newFileList = ig.filter(fileList);
          // let finalList = [];
          // newFileList.forEach((filePath) => {
          //   finalList.push(path.join(rootFolder, filePath));
          // });
          resolve(newFileList);
        }
        else {
          resolve(fileList);
        }
      } catch (err) {
        reject(err);
      }
    });
  }

  preparePackageManifest(options, tmpFolder) {
    //if(path.existsSync(''))
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
    return new Promise(async (resolve, reject) => {
      try {
        let rootPath = path.resolve(rootFolder);
        let fileList = fs.readdirSync(rootPath);
        fileList = await this.getExcludeList(rootPath, fileList);
        console.log(`Packaging Procedure into tar-gzip at ${path.resolve(path.join(rootPath, outputFilename))}`);
        tar.c(
          {
            gzip: true,
            file: path.join(outputFilename),
            cwd: rootPath
          },
          fileList
        ).then(_ => {
          resolve(true);
        }).catch((err) => {
          reject(err);
        });
      } catch (err) {
        reject(err);
      }
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
        return response.data.IpfsHash;
      })
      .catch(function (err) {
        console.warn(`Error pinning to Pinata: ${err}`);
        return error;
      });
  }

}

PackageBuilder.run_procedure = async function (input = null, secrets = null) {
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
      await packageBuilder.init();

      let outputFilename;
      if (inputs.procedureCode) {
        tmpFolderPath = packageBuilder.prepareTempFolder();

        if (inputs.secrets) {
          packageBuilder.packageSecrets(tmpFolderPath, inputs.secrets);
        }
        packageBuilder.preparePackageManifest(null, tmpFolderPath);

        for (let key in inputs.procedureCode) {
          let code = inputs.procedureCode[key];
          let filename = key;
          packageBuilder.writeToFile(filename, tmpFolderPath, code);
        }

        await packageBuilder.gzipPackage('Procedures', tmpFolderPath.split('\\')[1]);

      }
      else if (inputs.procPath) {
        let procPath = inputs.procPath;
        if (inputs.secrets) packageBuilder.packageSecrets(procPath, inputs.secrets);
        

        if (inputs.output) {
          outputFilename = inputs.output;
        }
        else {
          outputFilename = `${(Math.random() * 1000).toString()}.tgz`;
        }
        
        await packageBuilder.gzipPackage(procPath, outputFilename);
      }

      console.log("Procedure package successfully created.");
      if (input.doPublish == false) return true;
      let ipfsAddress = await packageBuilder.addToIpfs(outputFilename);
      console.log(`Procedure published at ${ipfsAddress}.`);
      resolve(ipfsAddress);
    } catch (err) {
      reject(err.toString());
    } finally {
      if (!!tmpFolderPath)
        await packageBuilder.cleanUp(tmpFolderPath);
    }
  });
}

module.exports = PackageBuilder.run_procedure;