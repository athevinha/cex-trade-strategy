import axios from "axios";
import {
    ImgnMode,
    IPosSide,
    OKXResponse
} from "../type";
import {OKX_BASE_API_URL} from "../utils/config";
import {makeHeaderAuthenticationOKX} from "./auth";
import {convertUSDToContractOrderSize} from "./okx.trade";
import {axiosErrorDecode} from "../utils";
import {getAccountPendingAlgoOrders} from "./okx.account";

export const openTrailingStopOrder = async ({
    instId,
    mgnMode,
    posSide,
    callbackRatio,
    size,
    reduceOnly = false,
  }: {
    instId: string;
    mgnMode: ImgnMode;
    posSide: IPosSide;
    callbackRatio: string;
    size: number;
    reduceOnly?: boolean
  }): Promise<OKXResponse> => {
    try {
      const sz = await convertUSDToContractOrderSize({ instId, sz: size });
      if(!sz) return {
        code: '',
        msg: 'Convert USD contract error',
        data: []
      }
      const _side = posSide === 'long' ? 'sell' : (posSide === 'short' ? 'buy' : 'net')
      const body = JSON.stringify({
        instId,
        tdMode: mgnMode,
        side: _side,
        posSide,
        callbackRatio,
        ordType: 'move_order_stop',
        sz,
        reduceOnly,
      });
      const path = `/api/v5/trade/order-algo`;
      const res = await axios.post(`${OKX_BASE_API_URL}${path}`, body, {
        headers: makeHeaderAuthenticationOKX("POST", path, body),
      });
      return res?.data;
    } catch (error: any) {
      axiosErrorDecode(error);
      return {
        code: error?.code,
        data: [],
        msg: axiosErrorDecode(error),
      };
    }
  };
  
export const closeAllTrailingStopWithInstId = async ({instId}: {instId: string}): Promise<OKXResponse> => {
    try {
        const algoOrders = await getAccountPendingAlgoOrders({instId})
        const body = JSON.stringify(algoOrders.map(algo => ({
          instId: algo.instId,
          algoId: algo.algoId
        })).slice(0,10));
        const path = `/api/v5/trade/cancel-algos`;
        const res = await axios.post(`${OKX_BASE_API_URL}${path}`, body, {
          headers: makeHeaderAuthenticationOKX("POST", path, body),
        });
        return res?.data as OKXResponse;
      } catch (error: any) {
        ;
        return {
          code: error?.code,
          data: [],
          msg: axiosErrorDecode(error),
        };
      }
}
