#!/bin/bash
sed -i '/<div className="px-6 py-4 border-b border-slate-100 mb-2">/i\
                        {userData && (\
                          <div className="px-6 py-4 border-b border-slate-100 mb-2 bg-slate-50">\
                              <div className="flex items-center justify-between mb-1">\
                                  <p className="text-[10px] font-black text-slate-400 uppercase">Objave ta mesec</p>\
                                  <p className="text-xs font-black text-[#0A1128]">\
                                      {monthlyAuctionsCount} / {userLimit === Infinity ? "∞" : userLimit}\
                                  </p>\
                              </div>\
                              {userLimit !== Infinity && (\
                                  <div className="w-full bg-slate-200 rounded-full h-1.5 mt-2 overflow-hidden">\
                                      <div \
                                          className={`h-full rounded-full transition-all ${monthlyAuctionsCount >= userLimit ? "bg-red-500" : "bg-[#FEBA4F]"}`} \
                                          style={{ width: `${Math.min(100, (monthlyAuctionsCount / userLimit) * 100)}%` }}\
                                      ></div>\
                                  </div>\
                              )}\
                          </div>\
                        )}' src/components/layout/Header.tsx
