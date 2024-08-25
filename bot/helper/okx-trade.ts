import axios from "axios";
import { OKX_BASE_API_URL } from "../utils/config";
import { makeHeaderAuthenticationOKX } from "./auth";
import {
  IContracConvertResponse,
  ISymbolPriceTicker,
  OKXResponse,
} from "../type";

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
    const _instId = `${instId.split("-")[0]}-${instId.split("-")[1]}`;
    const [{ idxPx }] = await getSymbolPriceTicker({ instId: _instId });
    const path = `/api/v5/public/convert-contract-coin?type=${type}&instId=${instId}&sz=${
      sz / Number(idxPx)
    }`;
    const res = await axios.get(`${OKX_BASE_API_URL}${path}`, {
      headers: makeHeaderAuthenticationOKX("GET", path, ""),
    });
    const [response] = res?.data?.data as IContracConvertResponse[];
    return response.sz;
  } catch (error) {
    console.log(error);
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
    const path = `/api/v5/market/index-tickers?quoteCcy=${quoteCcy}&instId=${instId}`;
    const res = await axios.get(`${OKX_BASE_API_URL}${path}`, {
      headers: makeHeaderAuthenticationOKX("GET", path, ""),
    });
    return res?.data?.data as ISymbolPriceTicker[];
  } catch (error) {
    console.log(error);
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
}: {
  instId: string;
  tdMode: string;
  side: string;
  posSide: string;
  ordType: string;
  szUSD: number;
  tpTriggerPx?: string;
  tpOrdPx?: string;
}): Promise<OKXResponse> => {
  try {
    const sz = await convertUSDToContractOrderSize({ instId, sz: szUSD });
    console.log(sz);
    const body = JSON.stringify({
      instId,
      tdMode,
      side,
      posSide,
      ordType,
      sz,
      tpOrdPx,
      tpTriggerPx,
    });
    const path = `/api/v5/trade/order`;
    const res = await axios.post(`${OKX_BASE_API_URL}${path}`, body, {
      headers: makeHeaderAuthenticationOKX("POST", path, body),
    });
    return res?.data;
  } catch (error: any) {
    console.error(error);
    return {
      code: error?.code,
      data: [],
      msg: `${error?.reason} ${error?.message}`,
    };
  }
};