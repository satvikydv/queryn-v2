'use client'

import { Button } from '@/components/ui/button';
import { DialogHeader, Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import useProject from '@/hooks/use-project';
import React from 'react'
import { toast } from 'sonner';

const InviteButton = () => {
    const {projectId} = useProject();
    const [open, setOpen] = React.useState(false);
    const [inviteUrl, setInviteUrl] = React.useState('');

    // Set the invite URL on client side only
    React.useEffect(() => {
        if (typeof window !== 'undefined' && projectId) {
            setInviteUrl(`${window.location.origin}/join/${projectId}`);
        }
    }, [projectId]);

    const handleCopyLink = () => {
        if (inviteUrl) {
            navigator.clipboard.writeText(inviteUrl);
            toast.success('Invite link copied to clipboard');
        }
    };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle className='text-lg font-semibold'>
                    Invite Members to Project
                </DialogTitle>
            </DialogHeader>
            <p>Copy and paste this link to invite members to the project:</p>
            <Input 
                className='mt-4 cursor-pointer'
                readOnly
                onClick={handleCopyLink}
                value={inviteUrl}
                placeholder="Loading invite link..."
            />
        </DialogContent>
      </Dialog>
      <Button 
        size='sm' 
        variant='outline' 
        onClick={() => setOpen(true)}
        className='border-emerald-700 text-emerald-700 hover:bg-emerald-700 hover:text-white'
      >
        Invite Members
      </Button>
    </>
  )
}

export default InviteButton