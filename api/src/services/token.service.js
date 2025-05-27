import db from "./db.js";

class TokenService {

    async getSupported() {
        try {
            const data = db.coin.findMany({ where: { is_active: true }});
            return data;
        } catch(e) {
            throw e;
        }
    }

}

export default new TokenService();
