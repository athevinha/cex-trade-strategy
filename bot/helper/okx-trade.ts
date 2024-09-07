import axios from "axios";
import {
  IContracConvertResponse,
  ImgnMode,
  IPosSide,
  ISide,
  ISymbolPriceTicker,
  OKXResponse,
} from "../type";
import {decodeClOrdId,decodeTag,getRandomeHttpAgent} from "../utils";
import {OKX_BASE_API_URL} from "../utils/config";
import {makeHeaderAuthenticationOKX} from "./auth";

export const setLeveragePair = async (
  instId: string,
  lever: number,
  mgnMode: string,
  posSide: string
): Promise<OKXResponse> => {
  try {
    const body = JSON.stringify({
      instId,
      lever,
      mgnMode,
      posSide,
    });
    const path = `/api/v5/account/set-leverage`;
    const res = await axios.post(`${OKX_BASE_API_URL}${path}`, body, {
      headers: makeHeaderAuthenticationOKX("POST", path, body),
    });
    return res?.data;
  } catch (error: any) {
    return {
      code: error?.code,
      data: [],
      msg: `${error?.reason} ${error?.message}`,
    };
  }
};
export const setPositionMode = async (
  mode: string = "long_short_mode"
): Promise<OKXResponse> => {
  try {
    const body = {
      posMode: mode,
    };
    const path = `/api/v5/account/set-position-mode`;
    const res = await axios.post(
      `${OKX_BASE_API_URL}${path}`,
      JSON.stringify(body),
      {
        headers: makeHeaderAuthenticationOKX(
          "POST",
          path,
          JSON.stringify(body)
        ),
      }
    );
    return res?.data;
  } catch (error: any) {
    return {
      code: error?.code,
      data: [],
      msg: `${error?.reason} ${error?.message}`,
    };
  }
};

export const convertUSDToContractOrderSize = async ({
  type = 1,
  instId,
  sz,
}: {
  type?: number;
  instId: string;
  sz: number;
}): Promise<string> => {
  try {
    const httpsAgent = getRandomeHttpAgent()
    const _instId = `${instId.split("-")[0]}-${instId.split("-")[1]}`;
    const [{ idxPx }] = await getSymbolPriceTicker({ instId: _instId });
    const path = `/api/v5/public/convert-contract-coin?type=${type}&instId=${instId}&sz=${
      sz / Number(idxPx)
    }`;
    const res = await axios.get(`${OKX_BASE_API_URL}${path}`, {
      headers: makeHeaderAuthenticationOKX("GET", path, ""),
      httpsAgent,
    });
    const [response] = res?.data?.data as IContracConvertResponse[];
    return response.sz;
  } catch (error:any) {
    console.error(error?.reason ,error?.message ,error?.code);
    return "0";
  }
};
export const getSymbolPriceTicker = async ({
  quoteCcy = "USDT",
  instId,
}: {
  quoteCcy?: string;
  instId: string;
}): Promise<ISymbolPriceTicker[]> => {
  try {
    const httpsAgent = getRandomeHttpAgent()
    const path = `/api/v5/market/index-tickers?quoteCcy=${quoteCcy}&instId=${instId}`;
    const res = await axios.get(`${OKX_BASE_API_URL}${path}`, {
      headers: makeHeaderAuthenticationOKX("GET", path, ""),
      httpsAgent
    });
    return res?.data?.data as ISymbolPriceTicker[];
  } catch (error:any) {
    console.error(error?.reason ,error?.message ,error?.code);
    return [];
  }
};

export const placeOrder = async ({
  instId,
  tdMode,
  side,
  posSide,
  ordType,
  szUSD,
  tpOrdPx,
  tpTriggerPx,
  clOrdId="",
  tag= "",
}: {
  instId: string;
  tdMode: string;
  side: ISide;
  posSide: IPosSide;
  ordType: string;
  szUSD: number;
  tpTriggerPx?: string;
  tpOrdPx?: string;
  clOrdId?: string;
  tag?:string;
}): Promise<OKXResponse> => {
  try {
    const sz = await convertUSDToContractOrderSize({ instId, sz: szUSD });
    const body = JSON.stringify({
      instId,
      tdMode,
      side,
      posSide,
      ordType,
      sz,
      tpOrdPx,
      tpTriggerPx,
      clOrdId,
      tag
    });
    const path = `/api/v5/trade/order`;
    const res = await axios.post(`${OKX_BASE_API_URL}${path}`, body, {
      headers: makeHeaderAuthenticationOKX("POST", path, body),
    });
    return res?.data;
  } catch (error: any) {
    console.error(error?.reason ,error?.message ,error?.code);
    return {
      code: error?.code,
      data: [],
      msg: `${error?.reason} ${error?.message}`,
    };
  }
};

export const openFuturePosition = async ({
  instId,
  leverage,
  mgnMode,
  size,
  posSide,
  ordType = 'market',
  intervalId = "",
}: {
  instId: string;
  mgnMode: ImgnMode
  posSide: IPosSide;
  ordType?: string;
  leverage: number;
  size: number;
  intervalId?: string;
}): Promise<OKXResponse> => {
  try {
    const maxRetries = 3;
    let attempts = 0;
    let po = {
      code: "0",
      data: [] as any[],
      msg: ""
    }
    const openPosition = async (): Promise<OKXResponse> => {
      const clOrdId = decodeClOrdId({intervalId, instId, posSide, leverage, size})
      const tag = decodeTag({intervalId, instId, posSide, leverage, size})
      const side: ISide = posSide  === 'long' ? 'buy' : 'sell'
      await setPositionMode("long_short_mode");
      await setLeveragePair(instId, leverage, mgnMode, posSide);
      return await placeOrder({instId, tdMode: mgnMode, side, posSide, ordType, szUSD: size,clOrdId, tag})
    }
    while (attempts < maxRetries) {
      attempts += 1;
      
      po = await openPosition();

      if (po.msg === "") {
        break;
      }
    }
    return po
  } catch (error: any) {
    console.error(error?.reason || "", error?.message || "", error.code || "")
    console.log(error)
    return {
      code: error?.code,
      data: [],
      msg: `${error?.reason} ${error?.message}`,
    };
  }
};

export const closeFuturePosition = async ({
  instId,
  mgnMode,
  posSide,
  clOrdId = '',
  tag = '',
}: {
  instId: string;
  mgnMode: ImgnMode;
  posSide: IPosSide;
  clOrdId?: string;
  tag?:string;
}): Promise<OKXResponse> => {
  const maxRetries = 3;
  let attempts = 0;
  let po = {
    code: "0",
    data: [] as any[],
    msg: ""
  }
  const closePosition = async (): Promise<OKXResponse> => {
    await setPositionMode('long_short_mode')
    const body = JSON.stringify({
      instId,
      mgnMode,
      posSide,
      clOrdId,
      tag
    });
    const path = `/api/v5/trade/close-position`;
    const res = await axios.post(`${OKX_BASE_API_URL}${path}`, body, {
      headers: makeHeaderAuthenticationOKX("POST", path, body),
    });
    return res.data as OKXResponse
  }
  try {
    while (attempts < maxRetries) {
      attempts += 1;
      po = await closePosition();
      if (po.msg === "") {
        break;
      }
    }
    return po
  } catch (error:any) {
    console.error(error?.reason || "", error?.message || "", error.code || "")
    return {
      code: error?.code,
      data: [],
      msg: `${error?.reason} ${error?.message}`,
    };
  }
 
}