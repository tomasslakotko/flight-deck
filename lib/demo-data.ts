import type { CrewProfile } from "@/lib/types";

export function buildDemoProfile(): CrewProfile {
  return {
    id: "me",
    name: "Crew",
    position: "CA",
  };
}

export const SAMPLE_PASSENGER_PASTE = `1A  BERZINS/JANIS MR  Gold  VIP  CKIN
1D  NIELSEN/SOFIE MS  Gold  VGML  CKIN
2C  KALNINS/ELZA MRS  WCHR  CKIN
4A  DOE/JOHN MR  Gold  LY12345678  WCHR VGML  CKIN  inw: BA715 ZRH-LHR
12A IVANOVA/ANNA MRS  GFML  CKIN
12F JOHNSON/PETER MR  UMNR  CKIN
20A BERMUDEZ/LUCIA MS  VLML  CKIN`;

export const SAMPLE_PREORDER = `Estimated PAX with meal = 4pcs  

007D / SPML / TOMLAK TOMLAK MS
         / HM10-DS2-BR8
               BR8 Apple juice
007E / SPML / MARTA MARTINSONE MS
         / HM8-DS1-BR8
               BR8 Apple juice
007F / SPML / IVAN IVANOV MS
         / HM16-BR10
               BR10 Multivitamin juice
012C / PMML / Toms Lakota MR`;

export const SAMPLE_ONBOARD_LIST = `BT668    15MAR TLL ONBOARD LIST                                 
CODESHARE FLIGHT - EK3507                                       
FLIGHT INFO      - 223        REG YL-ABP                        
CONFIGURATION EX - DXB      11C 130Y                            
-RIX   0/ 48/ 58/ 30/  1 PAX  3/12         PAD   0/  0        
  TTL 15                PAX  3/12                            
STATUS AF     ETD                                               

SEAT/DES TR C/S      NAME                                       

C CABIN                   TOTAL PAX 3                         
001D/RIX         Martino/EMARTO MRS                     
                 HAND  UNPAID                                   
001F/RIX         MAKSIM MAKSIMOV/ AFERO M                           
                 HAND  UNPAID                                                                             
002D/RIX    CHD  TOMINS/LAKTEV MS                              
                 HAND                                           
004D/RIX    CHD  Oiscu/lada MS                              
                 HAND           
................................................................
Y CABIN                   TOTAL PAX 12                         
005A/                                                           
005C/RIX         AUTIDA/EDUARDO MR                              
005D/                                                           
005E/RIX       D KATRININA/KATRINA PAULA MS                      
                 HAND                                           
005F/                 SJAKSTE/Madara                              
005F/RIX    INF  SJAKSTE/EMMA ELIZABETE                         
006A/RIX         MATISANE/JEKATERINA MS                         
006C/                            
006D/                      
006E/                                                           
006F/RIX         Melencuk/TANJA MS                           
                 BASE                                           
007A/                                      
007C/                                 
007D/RIX         TOMLAK/TOMLAK MS                          
                 SPML HM10DS2BR8                                
007E/RIX    CHD  MARTINSONE/MARTA MS                            
                 SPML HM8DS1BR8                                 
007F/RIX    CHD  IVANOV/IVAN MS                            
                 SPML HM16BR10                                  
012A/RIX         LAKOTA/TOMS MR                          
                 BASE                                           
                 PMML                                           
019D/RIX         MARTINSONE/ALLA MS                             EK
019E/RIX         MELEKA/EKERTE MR                            EK
026A/RIX    CHD  REINSONS/OLIVERS MR`;
