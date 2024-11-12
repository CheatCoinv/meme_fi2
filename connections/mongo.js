
import mongoose from 'mongoose'

let MONGO_CONNECTION

export const connectMongo = async () => {
    try {
        if (!MONGO_CONNECTION) {
            MONGO_CONNECTION = mongoose.createConnection(`${process.env.MONGO_DB_URL}${process.env.DATABASE_NAME}`)
        }
        return MONGO_CONNECTION
    } catch (e) {
        console.error("Error connecting to mongodb", e)
        throw e
    }
}

