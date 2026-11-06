import {expect,test,vi} from 'vitest';
import {readAccountTrainingSetups} from '@/lib/training/setups/server';
const document={schemaVersion:1,trainings:[],mainTrainingId:null};
test('reads the principal-derived atomic status and setup snapshot',async()=>{
 const rpc=vi.fn().mockResolvedValue({data:{revision:0,document,starterStatus:'pending'},error:null});
 const result=await readAccountTrainingSetups({rpc} as never,'untrusted-id');
 expect(rpc).toHaveBeenCalledWith('read_account_starter_snapshot_v1');
 expect(result).toEqual({revision:0,document,starterStatus:'pending'});
});
test('does not allow missing or invalid status to unlock an unsaved fallback',async()=>{
 for(const data of [{revision:0,document},{revision:0,document,starterStatus:'unknown'}]){
  const rpc=vi.fn().mockResolvedValue({data,error:null});
  expect(await readAccountTrainingSetups({rpc} as never,'a')).toBeNull();
 }
});
