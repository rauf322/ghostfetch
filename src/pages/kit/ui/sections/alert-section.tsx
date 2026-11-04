// Alerts and toasts: the three alerts, both toasts shown in place, and a live toast with Undo.
import { useEffect, useState } from 'react';
import { Alert } from '../../../../shared/ui/kit/alert.tsx';
import { Button } from '../../../../shared/ui/kit/button.tsx';
import { Toaster, createToastManager, toast } from '../../../../shared/ui/kit/toast.tsx';
import { Cell, Output, Row } from '../cell.tsx';

export function AlertSection() {
  const [undone, setUndone] = useState(0);

  const deleteRule = () => {
    const id = toast.add({
      title: 'Deleted “Checkout fails”',
      actionProps: {
        children: 'Undo',
        onClick: () => {
          setUndone((count) => count + 1);
          toast.close(id);
        },
      },
    });
  };

  return (
    <Cell title="Alert and toast" note="errors are inverted white, not red">
      <Alert>Recording is paused. Rules still apply.</Alert>
      <Alert variant="error">TypeError: Failed to fetch</Alert>
      <Alert variant="paused">
        Ghostfetch is off. Rules aren't applied until you turn it on from its toolbar
        icon.
      </Alert>
      <InlineToasts />
      <Row
        label="Live: one toast at a time, with Undo"
        className="flex items-center gap-3"
      >
        <Button size="sm" data-testid="kit-toast-button" onClick={deleteRule}>
          Delete a rule
        </Button>
        <Output testid="kit-toast-undone">
          undone {undone} {undone === 1 ? 'time' : 'times'}
        </Output>
      </Row>
    </Cell>
  );
}

// Two toasts shown in place and kept, to see both looks at once.
function InlineToasts() {
  const [info] = useState(createToastManager);
  const [error] = useState(createToastManager);
  useEffect(() => {
    const shown = [
      info.add({ title: 'Rule deleted', actionProps: { children: 'Undo' }, timeout: 0 }),
      error.add({
        title: "That file isn't a Ghostfetch export",
        type: 'error',
        timeout: 0,
      }),
    ];
    return () => {
      info.close(shown[0]);
      error.close(shown[1]);
    };
  }, [info, error]);
  return (
    <div className="flex flex-wrap items-center gap-4">
      <Toaster toastManager={info} inline />
      <Toaster toastManager={error} inline />
    </div>
  );
}
