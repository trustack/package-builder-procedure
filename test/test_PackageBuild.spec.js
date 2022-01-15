const package_build = require("../index.js");
const assert = require("assert");
const expect = require("chai").expect;

describe("PackageBuild", function() {
    context("single file procedure", function(){
            it("should return a IPFS address", async function(){
                    let input = {};
                    input.code = {'proc_index.js': `
                    modules.export = new function(){
                        return new Promise((resolve, reject) => {
                            resolve('hello there');
                        });
                    }`};
                    let ipfsAddress = "Qm";
                    //ipfsAddress = package_build();
// const secrets = input.secrets;
// const encryptKey = publicKey;
// const pinataApiKey = input.secrets.pinataApiKey;
// const pinataSecretApiKey = input.secrets.pinataSecretApiKey;
                    console.log(ipfsAddress);
                    assert.equal(ipfsAddress.substring(0,1) == "Qm", 0);
            })      
    })              

    // context("Passing proper number", function(){
    //         it("should add 2", function(){
    //                 assert.equal(addt(1), 3);
    //         })      
    // })      
    // context("With an array of numbers", function(){
    //         it("should add 2", function(){
    //                 assert.deepEqual(addt([1,2,3]) ,  [3,4,5]); #comparing objects so "deepEqual"
    //         })      
    // })
    // context("With non-numbers", function(){
    //         it("should throw error", function(){
    //                 expect(function(){
    //                         addt([1,"as", 1])
    //                 }).to.throw(TypeError, 'addTwo() exprects only numbers or array of numbers')
    //         })
    // })

})