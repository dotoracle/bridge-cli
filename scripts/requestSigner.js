
const Web3 = require('web3');
const web3 = new Web3();
const axios = require('axios')
const config = require('config')

module.exports = {
    signClaim: async function (requestHash, from, to, index) {
      let apiUrl = config.get('apiUrl')
      try {
        const signature = await axios.post(
          `${apiUrl}/request-withdraw`, 
          {
            requestHash: requestHash,
            fromChainId: from,
            toChainId: to, 
            index: index
          }
        )
        return signature.data
      } catch(e) {
        console.log(e)
        return null
      }      
    }
}
