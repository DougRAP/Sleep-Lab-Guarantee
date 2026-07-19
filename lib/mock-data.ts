
// lib/mock-data.ts
import { Guarantee, Claim } from "./types";

export const MOCK_GUARANTEES: Guarantee[] = [
  {
    id: "g1",
    transId: "1011099325A",
    storeId: "101",
    purchDate: "2026-05-15",
    custNam: "ANDREW TURNBULL",
    custEmail: "ajturnbull@gmail.com",
    custPhone: "3365086052",
    custStreet: "1217 NEW CREST LN",
    custCit: "SHELBY",
    custSt: "NC",
    custZip: "28150",
    manufacturer: "SEA",
    modelNum: "1234",
    prodRetailPrice: 599.99,
    prodSku: "3456",
    prodCat: "MATT",
    prodDesc: "SEALY PILLOW TOP XXXX",
    contractSku: "5YMULTI",
  },
  {
    id: "g2",
    transId: "1011099456B",
    storeId: "102",
    purchDate: "2026-06-20",
    custNam: "JANE DOE",
    custEmail: "jane@example.com",
    manufacturer: "TEMPUR",
    modelNum: "Cloud Elite",
    prodRetailPrice: 1299.00,
    prodDesc: "Tempur-Pedic Cloud Elite Queen",
  },
  {
    id: "g3",
    transId: "1011099789C",
    storeId: "101",
    purchDate: "2026-03-01",
    custNam: "ROBERT SMITH",
    manufacturer: "PURPLE",
    modelNum: "Hybrid Premier",
    prodRetailPrice: 1899.00,
    prodDesc: "Purple Hybrid Premier King",
  },
];

export const MOCK_CLAIMS: Claim[] = [];
