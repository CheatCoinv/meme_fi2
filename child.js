import { main } from "./_child.js";

const IDS = JSON.parse(process.argv[2])
const IDX = parseInt(process.argv[3])
const DATA = JSON.parse(process.argv[4])
const IS_SCHEDULE = process.argv[5] == "schedule"
main(IDS, IDX, DATA, IS_SCHEDULE)