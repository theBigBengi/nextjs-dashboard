'use server';

import { z } from 'zod';
import { sql } from '@vercel/postgres';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { signIn } from '@/auth';

const FormSchema = z.object({
  id: z.string(),
  customerId: z.string({
    invalid_type_error: 'Please select a customer.',
  }),
  amount: z.coerce
    .number()
    .gt(0, { message: 'Please enter an amount greater than $0.' }),
  status: z.enum(['pending', 'paid'], {
    invalid_type_error: 'Please select an invoice status.',
  }),
  date: z.string(),
});

const CreateInvoice = FormSchema.omit({ id: true, date: true });

export type State = {
  errors?: {
    customerId?: string[];
    amount?: string[];
    status?: string[];
  };
  message?: string | null;
};

export async function createInvoice(prevState: State, formData: FormData) {
  //  1. Extracting the data from formData.
  // Tip: If you're working with forms that have many fields,
  // you may want to consider using the entries() method with JavaScript's Object.fromEntries().
  // For example: const rawFormData = Object.fromEntries(formData.entries())

  // 2. Validating the types with Zod.
  const validatedFields = CreateInvoice.safeParse({
    customerId: formData.get('customerId'),
    amount: formData.get('amount'),
    status: formData.get('status'),
  });

  // If form validation fails, return errors early. Otherwise, continue.
  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Create Invoice.',
    };
  }

  // Prepare data for insertion into the database
  const { customerId, amount, status } = validatedFields.data;

  // 3. Converting the amount to cents.
  //   It's usually good practice to store monetary values in cents in your database
  //   to eliminate JavaScript floating-point errors and ensure greater accuracy.
  const amountInCents = amount * 100;

  // create a new date with the format "YYYY-MM-DD"
  const date = new Date().toISOString().split('T')[0];

  // 4. Passing the variables to your SQL query.
  //   create an SQL query to insert the new invoice
  // into the database and pass in the variables
  try {
    await sql`
  INSERT INTO invoices (customer_id, amount, status, date)
  VALUES (${customerId}, ${amountInCents}, ${status}, ${date})
`;
  } catch (error) {
    return {
      message: 'Database Error: Failed to Create Invoice.',
    };
  }

  // 5. Calling revalidatePath to clear the client cache and make a new server request.
  // Next.js has a Client-side Router Cache that stores the route segments in the user's browser for a time.
  // Along with prefetching, this cache ensures that users can quickly navigate between routes
  // while reducing the number of requests made to the server.
  // Since you're updating the data displayed in the invoices route,
  // you want to clear this cache and trigger a new request to the server.
  // You can do this with the revalidatePath function from Next.js
  revalidatePath('/dashboard/invoices');

  // 6. Calling redirect to redirect the user to the invoice's page.
  //   At this point, you also want to redirect the user back to the /dashboard/invoices page.
  //   You can do this with the redirect function from Next.js
  redirect('/dashboard/invoices');
  //   Note how redirect is being called outside of the try/catch block.
  //   This is because redirect works by throwing an error,
  //   which would be caught by the catch block.
  //   To avoid this, you can call redirect after try/catch.
  //  redirect would only be reachable if try is successful.
}

// Use Zod to update the expected types
const UpdateInvoice = FormSchema.omit({ id: true, date: true });

export async function updateInvoice(
  id: string,
  prevState: State,
  formData: FormData,
) {
  //  1. Extracting the data from formData.
  // 2. Validating the types with Zod.
  const validatedFields = UpdateInvoice.safeParse({
    customerId: formData.get('customerId'),
    amount: formData.get('amount'),
    status: formData.get('status'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Update Invoice.',
    };
  }

  const { customerId, amount, status } = validatedFields.data;
  // 3. Converting the amount to cents.
  const amountInCents = amount * 100;

  // 4. Passing the variables to your SQL query.
  try {
    await sql`
    UPDATE invoices
    SET customer_id = ${customerId}, amount = ${amountInCents}, status = ${status}
    WHERE id = ${id}
  `;
  } catch (error) {
    return { message: 'Database Error: Failed to Update Invoice.' };
  }

  // 5. Calling revalidatePath to clear the client cache and make a new server request.
  revalidatePath('/dashboard/invoices');

  // 6. Calling redirect to redirect the user to the invoice's page.
  redirect('/dashboard/invoices');
}

export async function deleteInvoice(id: string) {
  try {
    await sql`DELETE FROM invoices WHERE id = ${id}`;
    revalidatePath('/dashboard/invoices');
    return { message: 'Deleted Invoice.' };
  } catch (error) {
    return { message: 'Database Error: Failed to Delete Invoice.' };
  }
}

export async function authenticate(
  prevState: string | undefined,
  formData: FormData,
) {
  try {
    await signIn('credentials', Object.fromEntries(formData));
  } catch (error) {
    if ((error as Error).message.includes('CredentialsSignin')) {
      return 'CredentialsSignin';
    }
    throw error;
  }
}
